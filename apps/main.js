if (typeof require !== "undefined") {
  var { ensureCfg, cfg } = require("./config.js");
  var { getSolarPowerAvailable } = require("./solaredge.js");
  var { getValidToken, getDeviceStatus } = require("./tuya.js");
  var { extractCodeValue } = require("./utils.js");
  var {
    decideHeaterAction,
    noteInterruption,
    checkIfShouldStopForDay,
  } = require("./logic.js");
}

/***********************
 * Fonction principale
 ***********************/
function checkSolarAndControlHeater() {
  ensureCfg();
  var props = PropertiesService.getScriptProperties();
  var surplus = getSolarPowerAvailable();
  var state = props.getProperty("HEATER_STATE") || "OFF";
  var lastChange = parseInt(props.getProperty("LAST_CHANGE") || "0");
  var now = Date.now();
  var hour = new Date().getHours();
  var today = new Date().toDateString();
  var minutesSinceChange = (now - lastChange) / 60000;
  var lastDate = props.getProperty("LAST_DATE") || "";
  var lastCheck = props.getProperty("LAST_CHECK") || now;
  var deltaMinutes = Math.floor((now - lastCheck) / 60000);
  var dailyMinutes = parseInt(props.getProperty("DAILY_MINUTES") || "0");
  props.setProperty("LAST_CHECK", now.toString());

  var accessToken = getValidToken();
  if (!accessToken) {
    Logger.log("Aucun token Tuya valide — arrêt du contrôle");
    return;
  }

  // Check device status
  var deviceStatus = getDeviceStatus(accessToken, cfg.deviceId);
  var deviceRealStatus = deviceStatus
    ? extractCodeValue(deviceStatus, "switch")
    : null;
  if (deviceRealStatus != null && deviceRealStatus && state != "ON")
    Logger.log("🚨 Statut du device incohérent 🚨");

  // Manage the nb time that the heater is no more consuming energy when it is ON
  var devicePowerConsumption = deviceStatus
    ? extractCodeValue(deviceStatus, "cur_current")
    : null;

  if (
    devicePowerConsumption != null &&
    devicePowerConsumption < cfg.powerThreshold &&
    state === "ON"
  ) {
    // vérifier la durée depuis que la consommation est tombée
    var lastNoPowerTs = parseInt(
      props.getProperty("HEATER_NO_POWER_SINCE") || "0",
    );
    var nowMs = Date.now();
    if (!lastNoPowerTs) {
      props.setProperty("HEATER_NO_POWER_SINCE", nowMs.toString());
    } else {
      var durationNoPowerMin = (nowMs - lastNoPowerTs) / 60000;
      if (durationNoPowerMin >= cfg.noPowerMinutes) {
        // interruption confirmée
        var interrupts = noteInterruption(props, nowMs);
        // reset marker
        props.deleteProperty("HEATER_NO_POWER_SINCE");
        Logger.log(
          "Interruption confirmée, total interruptions récentes: " + interrupts,
        );

        // décision : si on a assez chauffé aujourd'hui et assez d'interruptions, arrêter pour la journée
        var dailyMinutes = parseInt(props.getProperty("DAILY_MINUTES") || "0");
        if (checkIfShouldStopForDay(props, dailyMinutes, nowMs)) {
          Logger.log(
            "=> Considérer la chauffe comme terminée pour aujourd'hui (stop).",
          );
          // action : forcer OFF et marquer jour comme complet
          // sendCommand(cfg.deviceId, accessToken, false);
          // props.setProperty("HEATER_STATE", "OFF");
          // props.setProperty("LAST_CHANGE", nowMs.toString());
          // // tu peux aussi mettre un flag DONE_FOR_DAY = true
          // props.setProperty("HEATER_DONE_FOR_DAY", "true");
        }
      }
    }
  } else {
    // consommation ok -> clear marker
    props.deleteProperty("HEATER_NO_POWER_SINCE");
  }

  // {
  //   // On considère que le chauffe-eau est OFF dans ce cas
  //   var newHeaterNbInterruption = props.getProperty("HEATER_NB_INTERRUPTION")
  //     ? (parseInt(props.getProperty("HEATER_NB_INTERRUPTION")) + 1).toString()
  //     : "1";
  //   Logger.log(
  //     `⚠️ Le chauffe-eau ne consomme plus d'énergie alors qu'il est allumé (${newHeaterNbInterruption}) ⚠️`,
  //   );
  //   props.setProperty("HEATER_NB_INTERRUPTION", newHeaterNbInterruption);

  // }

  // Ajuste le surplus pour tenir compte du chauffe eau allumé
  if (state === "ON") {
    surplus += CONFIG.heaterPower;
  }

  Logger.log({
    surplus,
    now,
    lastChange,
    lastCheck,
    minutesSinceChange,
    hour,
    state,
    dailyMinutes,
    deltaMinutes,
  });

  // Réinitialisation du compteur après heure creuse
  if (today !== lastDate && hour >= CONFIG.hcEndHour && state === "OFF") {
    dailyMinutes = 0;
    props.setProperty("LAST_DATE", today);
    Logger.log("Compteur quotidien réinitialisé à " + hour + "h");

    // réinitialisation du compteur d'interruptions
    Logger.log(
      `Réinitialisation du compteur d'interruptions, nb interruptions du jour ${props.getProperty("HEATER_NB_INTERRUPTION")}`,
    );
    props.setProperty("HEATER_NB_INTERRUPTION", "0");
    props.setProperty("ADD_ELE_TOTAL", "0");
  }

  // Mise à jour du compteur si ON
  if (state === "ON") {
    dailyMinutes += deltaMinutes;
  }
  props.setProperty("DAILY_MINUTES", dailyMinutes.toString());
  Logger.log("Durée totale ON aujourd'hui: " + dailyMinutes + " minutes");

  // Décision centralisée
  Logger.log(
    "État actuel: " +
      state +
      " depuis " +
      minutesSinceChange.toFixed(1) +
      " minutes",
  );
  var decision = decideHeaterAction({
    state: state,
    surplus: surplus,
    minutesSinceChange: minutesSinceChange,
    dailyMinutes: dailyMinutes,
    hour: hour,
  });
  Logger.log("Decision: " + JSON.stringify(decision));

  if (decision.action === "ON") {
    sendCommand(cfg.deviceId, accessToken, true);
    props.setProperty("HEATER_STATE", "ON");
    props.setProperty("HEATER_NB_INTERMEDIATE_INTERRUPTION", "0");
    creerDeclencheur("regularHeaterStatusCheck");
    props.setProperty("LAST_CHANGE", now.toString());
    Logger.log("➡️ Chauffe-eau allumé (raison: " + decision.reason + ")");
  } else if (decision.action === "OFF") {
    sendCommand(cfg.deviceId, accessToken, false);
    supprimerDeclencheur("regularHeaterStatusCheck");
    props.setProperty("HEATER_STATE", "OFF");
    props.setProperty("LAST_CHANGE", now.toString());
    Logger.log("➡️ Chauffe-eau éteint (raison: " + decision.reason + ")");
  } else {
    Logger.log("➡️ Pas de changement d’état (raison: " + decision.reason + ")");
  }
}

/***********************
 * Fonctions utilitaires
 * ***********************/
function regularHeaterStatusCheck() {
  ensureCfg();
  var props = PropertiesService.getScriptProperties();
  var state = props.getProperty("HEATER_STATE") || "OFF";
  var lastChange = parseInt(props.getProperty("LAST_CHANGE") || "0");
  var addEleLastTimeUpdate = parseInt(
    props.getProperty("ADD_ELE_LAST_TIME_UPDATE") || "0",
  );
  var addEleTotal = parseInt(props.getProperty("ADD_ELE_TOTAL") || "0");
  var now = Date.now();
  var minutesSinceChange = (now - lastChange) / 60000;

  var accessToken = getValidToken();
  if (!accessToken) {
    Logger.log("Aucun token Tuya valide — arrêt de la vérification");
    return;
  }

  // Checl ADD_ELE property to get total consumption
  var devideAddEleProperty = getDeviceProperty(
    accessToken,
    cfg.deviceId,
    "add_ele",
  );
  if (
    !devideAddEleProperty ||
    !devideAddEleProperty.properties ||
    !Array.isArray(devideAddEleProperty.properties)
  )
    return null;
  var addEleProperties = devideAddEleProperty.properties.find(function (s) {
    return s && s.code == "add_ele";
  });

  var newAddEleLastTimeUpdate = parseInt(addEleProperties.time);
  var newAddEleValue = parseInt(addEleProperties.value);
  var addEleTimeInterval =
    (newAddEleLastTimeUpdate - addEleLastTimeUpdate) / 1000;
  Logger.log(
    `Consume ${newAddEleValue} watt during ${addEleTimeInterval} seconds`,
  );
  if (addEleTimeInterval > 0) {
    var wattpersecond = newAddEleValue / addEleTimeInterval;
    Logger.log(`watt per second ${wattpersecond}`);
    if (wattpersecond < 0.1) {
      Logger.log(
        `⚠️ Reached target ${addEleTotal + newAddEleValue} watt after ${cfg.dailyMinutes} minutes, should be stopped ⚠️`,
      );
    }
    props.setProperty(
      "ADD_ELE_LAST_TIME_UPDATE",
      newAddEleLastTimeUpdate.toString(),
    );
    props.setProperty(
      "ADD_ELE_TOTAL",
      (addEleTotal + newAddEleValue).toString(),
    );
  }
  //////////////////////////////////////////////

  if (state === "OFF") {
    Logger.log("Chauffe-eau éteint, pas de vérification nécessaire");
    return;
  }

  // Check device status
  var deviceInfos = getDeviceStatus(accessToken, cfg.deviceId);

  var devicePowerConsumption = deviceInfos
    ? extractCodeValue(deviceInfos, "cur_current")
    : null;

  if (
    devicePowerConsumption != null &&
    devicePowerConsumption < 100 &&
    state === "ON"
  ) {
    // On considère que le chauffe-eau est ON mais ne consomme pas => indication que temperature max atteinte
    var newHeaterNbInterruption = props.getProperty(
      "HEATER_NB_INTERMEDIATE_INTERRUPTION",
    )
      ? (
          parseInt(props.getProperty("HEATER_NB_INTERMEDIATE_INTERRUPTION")) + 1
        ).toString()
      : "1";
    Logger.log(
      `⚠️ Le chauffe-eau ne consomme plus d'énergie alors qu'il est allumé depuis ${minutesSinceChange.toFixed(1)} minutes (nb interruption ${newHeaterNbInterruption}) ⚠️`,
    );
    props.setProperty(
      "HEATER_NB_INTERMEDIATE_INTERRUPTION",
      newHeaterNbInterruption,
    );
  }
}

function creerDeclencheur(declencheurName) {
  // Crée un déclencheur qui exécute la fonction "declencheurName"
  // toutes les minutes
  ScriptApp.newTrigger(declencheurName).timeBased().everyMinutes(1).create();
}

function supprimerDeclencheur(declencheurName) {
  const triggers = ScriptApp.getProjectTriggers();
  for (let t of triggers) {
    if (t.getHandlerFunction() === declencheurName) {
      ScriptApp.deleteTrigger(t);
    }
  }
}

/*************** End function secondaires */

/***********************
 * Gestion des Paramètres (Settings UI)
 ***********************/

/**
 * Retourne tous les paramètres stockés dans Script Properties
 * Utilisé par settings.html pour peupler le formulaire
 */
function getSettings() {
  var props = PropertiesService.getScriptProperties();
  return {
    // Seuils d'hystérésis
    thresholdOn: props.getProperty("thresholdOn") || "3000",
    thresholdOff: props.getProperty("thresholdOff") || "2000",
    heaterPower: props.getProperty("heaterPower") || "3000",
    // Durées minimales
    minOnMinutes: props.getProperty("minOnMinutes") || "30",
    minOffMinutes: props.getProperty("minOffMinutes") || "15",
    // Limites quotidiennes
    dailyMaxMinutes: props.getProperty("dailyMaxMinutes") || "240",
    minDailyMinutes: props.getProperty("minDailyMinutes") || "150",
    // Heures creuses
    hcStartHour: props.getProperty("hcStartHour") || "2",
    hcEndHour: props.getProperty("hcEndHour") || "6",
    // Configuration SolarEdge
    SITE_ID: props.getProperty("SITE_ID") || "",
    SOLAR_KEY: props.getProperty("SOLAR_KEY") || "",
    // Configuration Tuya
    TUYA_HOST: props.getProperty("TUYA_HOST") || "",
    TUYA_ACCESS_ID: props.getProperty("TUYA_ACCESS_ID") || "",
    TUYA_ACCESS_SECRET: props.getProperty("TUYA_ACCESS_SECRET") || "",
    TUYA_DEVICE_ID: props.getProperty("TUYA_DEVICE_ID") || "",
    // Mode et État
    DRY_RUN: props.getProperty("DRY_RUN") || "false",
    HEATER_STATE: props.getProperty("HEATER_STATE") || "OFF",
    DAILY_MINUTES: props.getProperty("DAILY_MINUTES") || "0",
    // Paramètres de détection des interruptions
    powerThreshold: props.getProperty("powerThreshold") || "100",
    noPowerMinutes: props.getProperty("noPowerMinutes") || "8",
    consecutiveInterrupts: props.getProperty("consecutiveInterrupts") || "3",
    interruptwindowMinutes: props.getProperty("interruptwindowMinutes") || "30",
    minTotalOnBeforeConsider:
      props.getProperty("minTotalOnBeforeConsider") || "45",
  };
}

/**
 * Sauvegarde les paramètres depuis settings.html
 * @param {Object} data - Dictionnaire clé-valeur des paramètres à sauvegarder
 */
function saveSettings(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Données invalides pour saveSettings");
  }

  var props = PropertiesService.getScriptProperties();

  // Liste des paramètres autorisés (évite d'écrire n'importe quoi)
  var allowedKeys = [
    "thresholdOn",
    "thresholdOff",
    "heaterPower",
    "minOnMinutes",
    "minOffMinutes",
    "dailyMaxMinutes",
    "minDailyMinutes",
    "hcStartHour",
    "hcEndHour",
    "SITE_ID",
    "SOLAR_KEY",
    "TUYA_HOST",
    "TUYA_ACCESS_ID",
    "TUYA_ACCESS_SECRET",
    "TUYA_DEVICE_ID",
    "DRY_RUN",
    "DAILY_MINUTES",
    "powerThreshold",
    "noPowerMinutes",
    "consecutiveInterrupts",
    "interruptwindowMinutes",
    "minTotalOnBeforeConsider",
    // Note: HEATER_STATE est en lecture seule
  ];

  var saved = 0;
  Object.keys(data).forEach(function (key) {
    if (allowedKeys.indexOf(key) >= 0) {
      props.setProperty(key, String(data[key]));
      saved++;
    }
  });

  Logger.log("Paramètres sauvegardés: " + saved + " champs mis à jour");
}

/**
 * Crée un menu personnalisé pour accéder à la UI settings
 * Déclenché automatiquement quand le script s'ouvre
 * Fonctionne avec Sheets, Docs, et Forms
 */
function onOpen() {
  try {
    var ui = null;

    // Essayer SpreadsheetApp d'abord
    try {
      ui = SpreadsheetApp.getUi();
    } catch (e1) {
      // Si Sheets n'est pas disponible, essayer DocumentApp
      try {
        ui = DocumentApp.getUi();
      } catch (e2) {
        // Si Docs n'est pas disponible, essayer FormApp
        try {
          ui = FormApp.getUi();
        } catch (e3) {
          Logger.log(
            "Aucun contexte UI disponible (Sheets/Docs/Forms). Exécutez manuellemen sur le Apps Script Editor.",
          );
          return;
        }
      }
    }

    if (ui) {
      var menu = ui.createMenu("🔧 Chauffe-eau");
      menu
        .addItem("📋 Paramètres", "openSettings")
        .addSeparator()
        .addItem("▶️ Lancer vérification", "checkSolarAndControlHeater")
        .addToUi();
      Logger.log("Menu créé avec succès");
    }
  } catch (e) {
    Logger.log("Erreur lors de la création du menu: " + e.message);
  }
}

/**
 * Ouvre la modal avec la UI settings.html
 */
function openSettings() {
  try {
    var htmlOutput = HtmlService.createHtmlOutputFromFile("settings")
      .setWidth(950)
      .setHeight(1200);

    var ui = null;

    // Essayer SpreadsheetApp d'abord
    try {
      ui = SpreadsheetApp.getUi();
      ui.showModalDialog(htmlOutput, "Paramètres du Chauffe-eau");
    } catch (e1) {
      // Si Sheets n'est pas disponible, essayer DocumentApp
      try {
        ui = DocumentApp.getUi();
        ui.showModalDialog(htmlOutput, "Paramètres du Chauffe-eau");
      } catch (e2) {
        // Si Docs n'est pas disponible, essayer FormApp
        try {
          ui = FormApp.getUi();
          ui.showModalDialog(htmlOutput, "Paramètres du Chauffe-eau");
        } catch (e3) {
          Logger.log(
            "Erreur: Aucun contexte UI disponible pour afficher la modal",
          );
        }
      }
    }
  } catch (e) {
    Logger.log("Erreur lors de l'ouverture des paramètres: " + e.message);
  }
}

/*************** End Settings UI */

/**
 * Crée une endpoint Web pour accéder aux paramètres
 * Appelée quand on accède à l'URL du script déployé en tant qu'application web
 */
function doGet() {
  try {
    var htmlOutput = HtmlService.createHtmlOutputFromFile("settings");
    return htmlOutput.setXFrameOptionsMode(
      HtmlService.XFrameOptionsMode.ALLOWALL,
    );
  } catch (e) {
    return HtmlService.createHtmlOutput(
      "<h1>Erreur</h1><p>" + e.message + "</p>",
    );
  }
}

// Export pour Jest
if (typeof module !== "undefined") {
  module.exports = { checkSolarAndControlHeater };
}

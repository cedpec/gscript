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
    devicePowerConsumption < 100 &&
    state === "ON"
  ) {
    // On considère que le chauffe-eau est OFF dans ce cas
    var newHeaterNbInterruption = props.getProperty("HEATER_NB_INTERRUPTION")
      ? (parseInt(props.getProperty("HEATER_NB_INTERRUPTION")) + 1).toString()
      : "1";
    Logger.log(
      `⚠️ Le chauffe-eau ne consomme plus d'énergie alors qu'il est allumé (${newHeaterNbInterruption}) ⚠️`,
    );
    props.setProperty("HEATER_NB_INTERRUPTION", newHeaterNbInterruption);
  }

  // Ajuste le surplus pour tenir compte du chauffe eau allumé
  if (state === "ON") {
    surplus += heaterPower;
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
  if (today !== lastDate && hour >= hcEndHour && state === "OFF") {
    dailyMinutes = 0;
    props.setProperty("LAST_DATE", today);
    Logger.log("Compteur quotidien réinitialisé à " + hour + "h");

    // réinitialisation du compteur d'interruptions
    Logger.log(
      `Réinitialisation du compteur d'interruptions, nb interruptions du jour ${props.getProperty("HEATER_NB_INTERRUPTION")}`,
    );
    props.setProperty("HEATER_NB_INTERRUPTION", "0");
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
  var now = Date.now();
  var minutesSinceChange = (now - lastChange) / 60000;

  if (state === "OFF") {
    Logger.log("Chauffe-eau éteint, pas de vérification nécessaire");
    return;
  }

  var accessToken = getValidToken();
  if (!accessToken) {
    Logger.log("Aucun token Tuya valide — arrêt de la vérification");
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

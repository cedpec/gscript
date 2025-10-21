/***********************
 * Paramètres à remplir
 ***********************/
// Seuils d’hystérésis
const thresholdOn = 1500; // allume si surplus > 3000 W
const thresholdOff = 2000; // éteint si surplus < 2000 W
const heaterPower = 3000; // puissance du chauffe-eau en W

const minOnMinutes = 30; // durée minimale ON
const minOffMinutes = 15; // durée minimale OFF

// Limite quotidienne (minutes)
const dailyMaxMinutes = 150;
// Durée minimale quotidienne garantie (minutes)
const minDailyMinutes = 90;

// Heures creuses (exemple : 2h → 5h)
const hcStartHour = 2;
const hcEndHour = 5;

var cfg = null;

/** Assure que `cfg` est initialisé depuis les ScriptProperties. */
function ensureCfg() {
  if (!cfg) cfg = getConfig();
  return cfg;
}

/**
 * Fonction pure qui décide de l'action à prendre sur le chauffe-eau.
 * Renvoie { action: 'ON'|'OFF'|'NONE', reason: string }
 * Paramètres d'entrée (objet) :
 *  - state: 'ON'|'OFF'
 *  - surplus: nombre (W)
 *  - minutesSinceChange: nombre
 *  - dailyMinutes: nombre
 *  - hour: nombre (0-23)
 *  - opts: optionnel, surcharge des constantes (thresholdOn, thresholdOff, minOnMinutes, minOffMinutes, dailyMaxMinutes, minDailyMinutes, hcStartHour, hcEndHour)
 */
function decideHeaterAction(input) {
  var state = input.state;
  var surplus = input.surplus;
  var minutesSinceChange = input.minutesSinceChange;
  var dailyMinutes = input.dailyMinutes;
  var hour = input.hour;
  var opts = input.opts || {};

  var tOn =
    typeof opts.thresholdOn !== "undefined" ? opts.thresholdOn : thresholdOn;
  var tOff =
    typeof opts.thresholdOff !== "undefined" ? opts.thresholdOff : thresholdOff;
  var minOn =
    typeof opts.minOnMinutes !== "undefined" ? opts.minOnMinutes : minOnMinutes;
  var minOff =
    typeof opts.minOffMinutes !== "undefined"
      ? opts.minOffMinutes
      : minOffMinutes;
  var maxDaily =
    typeof opts.dailyMaxMinutes !== "undefined"
      ? opts.dailyMaxMinutes
      : dailyMaxMinutes;
  var minDaily =
    typeof opts.minDailyMinutes !== "undefined"
      ? opts.minDailyMinutes
      : minDailyMinutes;
  var hcStart =
    typeof opts.hcStartHour !== "undefined" ? opts.hcStartHour : hcStartHour;
  var hcEnd =
    typeof opts.hcEndHour !== "undefined" ? opts.hcEndHour : hcEndHour;

  // Si la limite journalière atteinte
  if (dailyMinutes >= maxDaily) {
    if (state === "ON") return { action: "OFF", reason: "daily_limit" };
    return { action: "NONE", reason: "daily_limit_prevent_on" };
  }

  // Heures creuses : forçage ON si quota non atteint
  if (hour >= hcStart && hour < hcEnd && dailyMinutes < minDaily) {
    if (state === "OFF") return { action: "ON", reason: "hc_rattrapage" };
    return { action: "NONE", reason: "hc_already_on" };
  }

  // Hystérésis et durées minimales
  if (state === "OFF") {
    if (surplus > tOn && minutesSinceChange > minOff)
      return { action: "ON", reason: "hysteresis_on" };
    return { action: "NONE", reason: "stay_off" };
  }
  // state === 'ON'
  if (state === "ON") {
    if (surplus < tOff && minutesSinceChange > minOn)
      return { action: "OFF", reason: "hysteresis_off" };
    return { action: "NONE", reason: "stay_on" };
  }
  return { action: "NONE", reason: "unknown_state" };
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
  Logger.log("deviceRealStatus " + deviceRealStatus);

  // Manage the nb time that the heater is no more consuming energy when it is ON
  var devicePowerConsumption = deviceStatus
    ? extractCodeValue(deviceStatus, "cur_current")
    : null;
  if (
    devicePowerConsumption != null &&
    devicePowerConsumption < 100 &&
    state === "ON"
  ) {
    Logger.log(
      "⚠️ Le chauffe-eau ne consomme plus d'énergie alors qu'il est allumé.",
    );
    // On considère que le chauffe-eau est OFF dans ce cas
    var newHeaterNbInterruption = props.getProperty("HEATER_NB_INTERRUPTION")
      ? (parseInt(props.getProperty("HEATER_NB_INTERRUPTION")) + 1).toString()
      : "1";
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
      "Réinitialisation du compteur d'interruptions, nb interruptions du jour ",
      props.getProperty("HEATER_NB_INTERRUPTION"),
    );
    props.setProperty("HEATER_NB_INTERRUPTION", "0");
    Logger.log("Compteur d'interruptions réinitialisé");
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
    props.setProperty("LAST_CHANGE", now.toString());
    Logger.log("➡️ Chauffe-eau allumé (raison: " + decision.reason + ")");
  } else if (decision.action === "OFF") {
    sendCommand(cfg.deviceId, accessToken, false);
    props.setProperty("HEATER_STATE", "OFF");
    props.setProperty("LAST_CHANGE", now.toString());
    Logger.log("➡️ Chauffe-eau éteint (raison: " + decision.reason + ")");
  } else {
    Logger.log("➡️ Pas de changement d’état (raison: " + decision.reason + ")");
  }
}

// Récupère la configuration et inclut le flag DRY_RUN (true/false)
function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    siteId: props.getProperty("SITE_ID"),
    apiKeySolar: props.getProperty("SOLAR_KEY"),
    tuyaHost: props.getProperty("TUYA_HOST"),
    tuyaAccessId: props.getProperty("TUYA_ACCESS_ID"),
    tuyaAccessSecret: props.getProperty("TUYA_ACCESS_SECRET"),
    deviceId: props.getProperty("TUYA_DEVICE_ID"),
    dryRun: (props.getProperty("DRY_RUN") || "false").toLowerCase() === "true",
  };
}

/***********************
 * Lecture production SolarEdge
 ***********************/
function getSolarPowerAvailable() {
  ensureCfg();
  if (!cfg.siteId || !cfg.apiKeySolar) {
    Logger.log("Configuration SolarEdge manquante (SITE_ID ou SOLAR_KEY)");
    return 0;
  }
  var url =
    "https://monitoringapi.solaredge.com/site/" +
    cfg.siteId +
    "/currentPowerFlow.json?api_key=" +
    cfg.apiKeySolar;
  try {
    var response = UrlFetchApp.fetch(url);
    var data = JSON.parse(response.getContentText());
    var power_pv =
      ((data.siteCurrentPowerFlow &&
        data.siteCurrentPowerFlow.PV &&
        data.siteCurrentPowerFlow.PV.currentPower) ||
        0) * 1000;
    var power_load =
      ((data.siteCurrentPowerFlow &&
        data.siteCurrentPowerFlow.LOAD &&
        data.siteCurrentPowerFlow.LOAD.currentPower) ||
        0) * 1000;
    var power_grid =
      ((data.siteCurrentPowerFlow &&
        data.siteCurrentPowerFlow.GRID &&
        data.siteCurrentPowerFlow.GRID.currentPower) ||
        0) * 1000;
    Logger.log("power pv %s W", power_pv);
    Logger.log("power load %s W", power_load);
    Logger.log("power grid %s W", power_grid);
    var surplus = power_pv - power_load; // énergie dispo pour chauffe-eau
    return surplus;
  } catch (e) {
    Logger.log("Erreur fetch SolarEdge: " + e);
    return 0;
  }
}

/**
 * Tuya signature
 * @param method
 * @param path
 * @param body
 * @param accesstoken
 */
function tuyaSignedRequest(method, path, body, accessToken) {
  ensureCfg();
  if (!cfg.tuyaAccessId || !cfg.tuyaAccessSecret || !cfg.tuyaHost) {
    throw new Error("Configuration Tuya incomplète pour signature");
  }
  var contentSha = sha256Hex(body || "");
  var stringToSign = method + "\n" + contentSha + "\n\n" + path;
  var t = Date.now().toString();
  var nonce = Utilities.getUuid();
  var toSign =
    cfg.tuyaAccessId + (accessToken || "") + t + nonce + stringToSign;
  var sign = hmacSha256Hex(toSign, cfg.tuyaAccessSecret).toUpperCase();

  var headers = {
    client_id: cfg.tuyaAccessId,
    sign: sign,
    sign_method: "HMAC-SHA256",
    t: t,
    nonce: nonce,
    "Content-Type": "application/json",
  };
  if (accessToken) headers["access_token"] = accessToken;

  return {
    url: (cfg.tuyaHost || "") + path,
    options: {
      method: method.toLowerCase(),
      headers: headers,
      muteHttpExceptions: true,
      payload: body || null,
    },
  };
}

/**
 * Envoie une commande ON/OFF à un device Tuya
 * @param {string} deviceId - ID du périphérique
 * @param {string} accessToken - Access token Tuya
 * @param {boolean} turnOn - true = ON, false = OFF
 */
function sendCommand(deviceId, accessToken, turnOn) {
  ensureCfg();
  var targetDeviceId = deviceId || cfg.deviceId;
  if (!targetDeviceId) {
    Logger.log("Device ID manquant (paramètre ou configuration)");
    return null;
  }
  var path = "/v1.0/devices/" + targetDeviceId + "/commands";
  var method = "POST";

  var bodyObj = {
    commands: [
      {
        code: "switch",
        value: turnOn,
      },
    ],
  };
  var body = JSON.stringify(bodyObj);
  var request = tuyaSignedRequest(method, path, body, accessToken);
  if (cfg.dryRun) {
    Logger.log(
      "[DRY_RUN] Commande simulée vers Tuya: " + JSON.stringify(bodyObj),
    );
    return JSON.stringify({ simulated: true, body: bodyObj });
  }
  try {
    var response = UrlFetchApp.fetch(request.url, {
      method: request.options.method,
      headers: request.options.headers,
      payload: request.options.payload,
      muteHttpExceptions: request.options.muteHttpExceptions,
    });
    Logger.log(
      "HTTP " + response.getResponseCode() + " -> " + response.getContentText(),
    );
    return response.getContentText();
  } catch (e) {
    Logger.log("Erreur envoi commande Tuya: " + e);
    return null;
  }
}

function getValidToken() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("TUYA_TOKEN");
  var tokenTime = parseInt(props.getProperty("TUYA_TOKEN_TIME") || "0");
  var expire = parseInt(props.getProperty("TUYA_EXPIRE") || "0");

  var now = Math.floor(Date.now() / 1000);
  if (token && now - tokenTime < expire) {
    return token;
  }

  var newToken = getTuyaToken();
  if (!newToken || !newToken.token) {
    Logger.log("Impossible d’obtenir un token Tuya");
    return null;
  }

  props.setProperty("TUYA_TOKEN", newToken.token);
  props.setProperty("TUYA_TOKEN_TIME", now.toString());
  props.setProperty("TUYA_EXPIRE", newToken.expire.toString());
  return newToken.token;
}

function getTuyaToken() {
  ensureCfg();
  var path = "/v1.0/token?grant_type=1";
  var method = "GET";
  var body = "";

  if (!cfg.tuyaAccessId || !cfg.tuyaAccessSecret || !cfg.tuyaHost) {
    Logger.log("Configuration Tuya manquante (ACCESS_ID/SECRET/HOST)");
    return null;
  }

  var request = tuyaSignedRequest(method, path, body);
  try {
    var resp = UrlFetchApp.fetch(request.url, {
      method: request.options.method,
      headers: request.options.headers,
      muteHttpExceptions: request.options.muteHttpExceptions,
    });

    Logger.log(
      "HTTP " + resp.getResponseCode() + " -> " + resp.getContentText(),
    );
    try {
      var data = JSON.parse(resp.getContentText());
      Logger.log(JSON.stringify(data, null, 2));
      if (data && data.success)
        return {
          token: data.result.access_token,
          expire: data.result.expire_time,
        };
    } catch (e) {
      Logger.log("Parse error: " + e);
    }
  } catch (e) {
    Logger.log("Erreur fetch token Tuya: " + e);
  }
  return null;
}

function getDeviceStatus(accessToken, deviceId) {
  ensureCfg();
  if (!deviceId) {
    Logger.log("deviceId manquant");
    return null;
  }
  var path = "/v1.0/devices/" + deviceId + "/status";
  var request = tuyaSignedRequest("GET", path, "", accessToken);
  try {
    var response = UrlFetchApp.fetch(request.url, {
      method: request.options.method,
      headers: request.options.headers,
      muteHttpExceptions: request.options.muteHttpExceptions,
    });
    Logger.log(
      "HTTP " + response.getResponseCode() + " -> " + response.getContentText(),
    );
    try {
      var data = JSON.parse(response.getContentText());
      if (data && data.success) {
        return data.result;
      } else {
        Logger.log("Erreur API : " + JSON.stringify(data));
        return null;
      }
    } catch (e) {
      Logger.log("Erreur parse JSON : " + e);
      return null;
    }
  } catch (e) {
    Logger.log("Erreur fetch status Tuya: " + e);
    return null;
  }
}

function extractCodeValue(statusArray, codeStr) {
  if (!statusArray || !Array.isArray(statusArray)) return null;
  var found = statusArray.find(function (s) {
    return s && s.code == codeStr;
  });
  return found ? found.value : null;
}

/* Helpers */
function sha256Hex(str) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    str,
    Utilities.Charset.UTF_8,
  );
  return bytesToHex(bytes).toLowerCase();
}

function hmacSha256Hex(message, secret) {
  var raw = Utilities.computeHmacSha256Signature(
    message,
    secret,
    Utilities.Charset.UTF_8,
  );
  return bytesToHex(raw);
}

function bytesToHex(bytes) {
  return bytes
    .map(function (b) {
      var v = b < 0 ? b + 256 : b;
      var h = v.toString(16);
      return h.length === 1 ? "0" + h : h;
    })
    .join("");
}

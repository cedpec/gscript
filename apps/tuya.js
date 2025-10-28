// tuya.js
if (typeof require !== "undefined") {
  var { ensureCfg, cfg } = require("./config.js");
  var { sha256Hex, hmacSha256Hex } = require("./utils.js");
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

// Si tu veux tester avec Jest
if (typeof module !== "undefined") {
  module.exports = { sendCommand, getValidToken, getDeviceStatus };
}

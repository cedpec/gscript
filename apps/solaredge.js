var SOLAREDGE_API_BASE_URL = "https://monitoringapi.solaredge.com/v2";
var SOLAREDGE_TOKEN_URL = "https://monitoringapi.solaredge.com/v2/oauth2/token";
var SOLAREDGE_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
var SOLAREDGE_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
var SOLAREDGE_START_HOUR = 10;
var SOLAREDGE_END_HOUR = 17;

if (typeof require !== "undefined") {
  var { ensureCfg } = require("./config.js");
}

function exchangeSolarEdgeAuthorizationCode(code) {
  var authorizationCode = typeof code === "string" ? code.trim() : "";
  if (!authorizationCode) {
    throw new Error("Code d'autorisation SolarEdge manquant");
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    throw new Error("Un échange de code SolarEdge est déjà en cours");
  }

  try {
    var props = PropertiesService.getScriptProperties();
    if (!props.getProperty("SITE_ID")) {
      throw new Error("SITE_ID manquant dans les propriétés du script");
    }
    var redirectUri = props.getProperty("SOLAREDGE_REDIRECT_URI");
    if (!redirectUri) {
      throw new Error(
        "SOLAREDGE_REDIRECT_URI manquant; il doit correspondre exactement au redirect_uri utilisé pour générer le code",
      );
    }
    var token = requestSolarEdgeToken_({
      grant_type: "authorization_code",
      code: authorizationCode,
      redirect_uri: redirectUri,
    });
    saveSolarEdgeToken_(props, token);
    Logger.log("Connexion OAuth SolarEdge enregistrée");
    return true;
  } finally {
    lock.releaseLock();
  }
}

function setupSolarEdgeTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "refreshSolarPowerCache") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger("refreshSolarPowerCache")
    .timeBased()
    .everyMinutes(15)
    .create();
  Logger.log("Déclencheur SolarEdge configuré toutes les 15 minutes");
}

function refreshSolarPowerCache() {
  var now = Date.now();
  if (!isWithinSolarEdgeWindow_(now)) {
    return getSolarPowerAvailable();
  }

  var props = PropertiesService.getScriptProperties();
  var dailyMinutes = parseInt(props.getProperty("DAILY_MINUTES") || "0", 10);
  if (!isFinite(dailyMinutes)) dailyMinutes = 0;
  var dailyMaxMinutes = ensureCfg().dailyMaxMinutes;
  if (dailyMinutes >= dailyMaxMinutes) {
    Logger.log(
      "Actualisation SolarEdge ignorée: limite quotidienne du chauffe-eau atteinte (" +
        dailyMinutes +
        "/" +
        dailyMaxMinutes +
        " min)",
    );
    return getSolarPowerAvailable();
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log(
      "Actualisation SolarEdge ignorée: une autre exécution est active",
    );
    return getSolarPowerAvailable();
  }

  try {
    return refreshSolarPowerCacheWithLock_(now);
  } finally {
    lock.releaseLock();
  }
}

function refreshSolarPowerCacheWithLock_(now) {
  var props = PropertiesService.getScriptProperties();
  var lastAttempt = parseInt(
    props.getProperty("SOLAREDGE_LAST_ATTEMPT") || "0",
    10,
  );
  if (now - lastAttempt < SOLAREDGE_REFRESH_INTERVAL_MS) {
    return getSolarPowerAvailable();
  }

  // Record attempts, not only successful calls, to avoid retry bursts on errors.
  props.setProperty("SOLAREDGE_LAST_ATTEMPT", now.toString());

  try {
    var accessToken = getSolarEdgeAccessToken_(props);
    var telemetry = fetchSolarEdgeTelemetry_(accessToken, now);
    var exportedPower = getLatestMetricTotal_(telemetry, "exportPower");
    var importedPower = getLatestMetricTotal_(telemetry, "importPower");
    var surplus = exportedPower - importedPower;

    props.setProperty("SOLAREDGE_POWER_SURPLUS", surplus.toString());
    props.setProperty("SOLAREDGE_POWER_UPDATED_AT", now.toString());
    Logger.log("Mesure SolarEdge mise en cache: " + surplus + " W");
    return surplus;
  } catch (error) {
    Logger.log("Erreur actualisation SolarEdge: " + error.message);
    return getSolarPowerAvailable();
  }
}

function getSolarPowerAvailable() {
  var props = PropertiesService.getScriptProperties();
  var value = props.getProperty("SOLAREDGE_POWER_SURPLUS");
  var surplus = parseFloat(value);
  var updatedAt = parseInt(
    props.getProperty("SOLAREDGE_POWER_UPDATED_AT") || "0",
    10,
  );

  if (
    value === null ||
    !isFinite(surplus) ||
    !isFinite(updatedAt) ||
    Date.now() - updatedAt > SOLAREDGE_CACHE_MAX_AGE_MS
  ) {
    return 0;
  }
  return surplus;
}

function getSolarEdgeAccessToken_(props) {
  var clientId = props.getProperty("SOLAREDGE_CLIENT_ID");
  var clientSecret = props.getProperty("SOLAREDGE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error(
      "SOLAREDGE_CLIENT_ID ou SOLAREDGE_CLIENT_SECRET manquant dans les propriétés du script",
    );
  }

  var accessToken = props.getProperty("SOLAREDGE_ACCESS_TOKEN");
  var expiresAt = parseInt(
    props.getProperty("SOLAREDGE_ACCESS_TOKEN_EXPIRES_AT") || "0",
    10,
  );
  if (accessToken && Date.now() + 60 * 1000 < expiresAt) {
    return accessToken;
  }

  var refreshToken = props.getProperty("SOLAREDGE_REFRESH_TOKEN");
  if (!refreshToken) {
    throw new Error(
      "Connexion SolarEdge absente ou expirée; relancez l'autorisation OAuth",
    );
  }

  var token = requestSolarEdgeToken_({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  saveSolarEdgeToken_(props, token);
  return token.access_token;
}

function requestSolarEdgeToken_(grant) {
  var props = PropertiesService.getScriptProperties();
  var clientId = props.getProperty("SOLAREDGE_CLIENT_ID");
  var clientSecret = props.getProperty("SOLAREDGE_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    throw new Error(
      "SOLAREDGE_CLIENT_ID ou SOLAREDGE_CLIENT_SECRET manquant dans les propriétés du script",
    );
  }

  var payload = {
    grant_type: grant.grant_type,
    client_id: clientId,
    client_secret: clientSecret,
  };
  if (grant.code) payload.code = grant.code;
  if (grant.refresh_token) payload.refresh_token = grant.refresh_token;
  if (grant.redirect_uri) payload.redirect_uri = grant.redirect_uri;

  var response = UrlFetchApp.fetch(SOLAREDGE_TOKEN_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var status = response.getResponseCode();
  var responseText = response.getContentText();
  if (status < 200 || status >= 300) {
    var details = getOAuthErrorDetails_(responseText, [
      clientId,
      clientSecret,
      grant.code,
      grant.refresh_token,
      props.getProperty("SOLAREDGE_ACCESS_TOKEN"),
    ]);
    throw new Error(
      "SolarEdge a refusé l'échange OAuth (HTTP " +
        status +
        ")" +
        (details ? ": " + details : ""),
    );
  }

  var token;
  try {
    token = JSON.parse(responseText);
  } catch (error) {
    throw new Error("Réponse OAuth SolarEdge invalide");
  }
  if (
    !token ||
    typeof token.access_token !== "string" ||
    typeof token.refresh_token !== "string" ||
    !isFinite(Number(token.expires_in)) ||
    Number(token.expires_in) <= 0 ||
    !token.access_token ||
    !token.refresh_token
  ) {
    throw new Error("Réponse OAuth SolarEdge incomplète");
  }
  if (token.token_type && token.token_type.toLowerCase() !== "bearer") {
    throw new Error("Type de jeton OAuth SolarEdge non pris en charge");
  }
  return token;
}

function getOAuthErrorDetails_(responseText, secrets) {
  var response;
  try {
    response = JSON.parse(responseText);
  } catch (error) {
    return "";
  }
  if (!response || typeof response !== "object") return "";

  var errorCode =
    typeof response.error === "string" ? response.error.trim() : "";
  var description =
    typeof response.error_description === "string"
      ? response.error_description
      : typeof response.message === "string"
        ? response.message
        : typeof response.description === "string"
          ? response.description
          : "";
  var details = [errorCode, description]
    .filter(Boolean)
    .join(": ")
    .replace(/\s+/g, " ")
    .trim();

  (secrets || []).forEach(function (secret) {
    if (secret) details = details.split(secret).join("[masqué]");
  });
  return details.slice(0, 240);
}

function saveSolarEdgeToken_(props, token) {
  var expiresAt = Date.now() + parseInt(token.expires_in, 10) * 1000;
  props.setProperty("SOLAREDGE_ACCESS_TOKEN", token.access_token);
  props.setProperty("SOLAREDGE_REFRESH_TOKEN", token.refresh_token);
  props.setProperty("SOLAREDGE_ACCESS_TOKEN_EXPIRES_AT", expiresAt.toString());
}

function fetchSolarEdgeTelemetry_(accessToken, now) {
  var from = new Date(now - SOLAREDGE_REFRESH_INTERVAL_MS).toISOString();
  var to = new Date(now).toISOString();
  var query =
    "resolution=QUARTER_HOUR&from=" +
    encodeURIComponent(from) +
    "&to=" +
    encodeURIComponent(to);
  var siteId = PropertiesService.getScriptProperties().getProperty("SITE_ID");
  if (!siteId) {
    throw new Error("SITE_ID manquant dans les propriétés du script");
  }
  var url =
    SOLAREDGE_API_BASE_URL +
    "/sites/" +
    encodeURIComponent(siteId) +
    "/meters/telemetry?" +
    query;
  var response = UrlFetchApp.fetch(url, {
    method: "get",
    headers: { Authorization: "Bearer " + accessToken },
    muteHttpExceptions: true,
  });
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error("Lecture de la télémétrie SolarEdge: HTTP " + status);
  }

  try {
    return JSON.parse(response.getContentText());
  } catch (error) {
    throw new Error("Réponse de télémétrie SolarEdge invalide");
  }
}

function getLatestMetricTotal_(data, metric) {
  var values = [];

  function latestNumber(value) {
    if (typeof value === "number" && isFinite(value)) return value;
    if (typeof value === "string" && value !== "" && isFinite(Number(value))) {
      return Number(value);
    }
    if (Array.isArray(value)) {
      for (var i = value.length - 1; i >= 0; i--) {
        var arrayValue = latestNumber(value[i]);
        if (arrayValue !== null) return arrayValue;
      }
      return null;
    }
    if (value && typeof value === "object") {
      var preferredKeys = ["value", "values", "data", "series"];
      for (var j = 0; j < preferredKeys.length; j++) {
        if (Object.prototype.hasOwnProperty.call(value, preferredKeys[j])) {
          var nestedValue = latestNumber(value[preferredKeys[j]]);
          if (nestedValue !== null) return nestedValue;
        }
      }
    }
    return null;
  }

  function collect(node) {
    if (Array.isArray(node)) {
      node.forEach(collect);
    } else if (node && typeof node === "object") {
      Object.keys(node).forEach(function (key) {
        if (key === metric) {
          var value = latestNumber(node[key]);
          if (value !== null) values.push(value);
        } else {
          collect(node[key]);
        }
      });
    }
  }

  collect(data);
  if (values.length === 0) {
    throw new Error("Mesure " + metric + " absente de la réponse SolarEdge");
  }
  return values.reduce(function (total, value) {
    return total + value;
  }, 0);
}

function isWithinSolarEdgeWindow_(timestamp) {
  var hour = new Date(timestamp).getHours();
  return hour >= SOLAREDGE_START_HOUR && hour < SOLAREDGE_END_HOUR;
}

if (typeof module !== "undefined") {
  module.exports = {
    exchangeSolarEdgeAuthorizationCode,
    setupSolarEdgeTrigger,
    refreshSolarPowerCache,
    getSolarPowerAvailable,
  };
}

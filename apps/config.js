/***********************
 * Paramètres et configuration
 ***********************/
const CONFIG = {
  // Seuils d’hystérésis
  thresholdOff: 2000, // éteint si surplus < 2000 W
  thresholdOn: 2000, // allume si surplus > 3000 W

  heaterPower: 3000, // puissance du chauffe-eau en W
  minOnMinutes: 30, // durée minimale ON
  minOffMinutes: 15, // durée minimale OFF

  // Limite quotidienne (minutes)
  dailyMaxMinutes: 150,
  // Durée minimale quotidienne garantie (minutes)
  minDailyMinutes: 90,

  // Heures creuses (exemple : 2h → 5h)
  hcStartHour: 2,
  hcEndHour: 5,
};

var cfg = null;

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

/** Assure que `cfg` est initialisé depuis les ScriptProperties. */
function ensureCfg() {
  if (!cfg) cfg = getConfig();
  return cfg;
}

// Si tu veux tester avec Jest
if (typeof module !== "undefined") {
  module.exports = {
    CONFIG,
    get cfg() {
      return cfg; // ✅ getter dynamique
    },
    ensureCfg,
  };
}

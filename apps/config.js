/***********************
 * Paramètres et configuration
 ***********************/
const CONFIG = {
  // Seuils d’hystérésis
  thresholdOff: 2000, // éteint si surplus < 2000 W
  thresholdOn: 1800, // allume si surplus > 2000 W

  heaterPower: 3000, // puissance du chauffe-eau en W
  minOnMinutes: 30, // durée minimale ON
  minOffMinutes: 15, // durée minimale OFF

  // Limite quotidienne (minutes)
  dailyMaxMinutes: 240,
  // Durée minimale quotidienne garantie (minutes)
  minDailyMinutes: 150,

  // Heures creuses (exemple : 2h → 6h)
  hcStartHour: 2,
  hcEndHour: 6,

  // Paramètres de détection des interruptions
  powerThreshold: 100, // W
  noPowerMinutes: 8, // minutes
  consecutiveInterrupts: 3,
  interruptwindowMinutes: 30,
  minTotalOnBeforeConsider: 45,
};

var cfg = null;

// Récupère la configuration depuis les Script Properties avec les valeurs par défaut
function getConfig() {
  var props = PropertiesService.getScriptProperties();
  return {
    // Seuils d'hystérésis
    thresholdOn:
      parseInt(props.getProperty("thresholdOn")) || CONFIG.thresholdOn,
    thresholdOff:
      parseInt(props.getProperty("thresholdOff")) || CONFIG.thresholdOff,
    heaterPower:
      parseInt(props.getProperty("heaterPower")) || CONFIG.heaterPower,

    // Durées minimales
    minOnMinutes:
      parseInt(props.getProperty("minOnMinutes")) || CONFIG.minOnMinutes,
    minOffMinutes:
      parseInt(props.getProperty("minOffMinutes")) || CONFIG.minOffMinutes,

    // Limites quotidiennes
    dailyMaxMinutes:
      parseInt(props.getProperty("dailyMaxMinutes")) || CONFIG.dailyMaxMinutes,
    minDailyMinutes:
      parseInt(props.getProperty("minDailyMinutes")) || CONFIG.minDailyMinutes,

    // Heures creuses
    hcStartHour:
      parseInt(props.getProperty("hcStartHour")) || CONFIG.hcStartHour,
    hcEndHour: parseInt(props.getProperty("hcEndHour")) || CONFIG.hcEndHour,

    // APIs
    siteId: props.getProperty("SITE_ID"),
    apiKeySolar: props.getProperty("SOLAR_KEY"),
    tuyaHost: props.getProperty("TUYA_HOST"),
    tuyaAccessId: props.getProperty("TUYA_ACCESS_ID"),
    tuyaAccessSecret: props.getProperty("TUYA_ACCESS_SECRET"),
    deviceId: props.getProperty("TUYA_DEVICE_ID"),

    // Mode
    dryRun: (props.getProperty("DRY_RUN") || "false").toLowerCase() === "true",

    // Paramètres de détection des interruptions
    powerThreshold:
      parseInt(props.getProperty("powerThreshold")) || CONFIG.powerThreshold,
    noPowerMinutes:
      parseInt(props.getProperty("noPowerMinutes")) || CONFIG.noPowerMinutes,
    consecutiveInterrupts:
      parseInt(props.getProperty("consecutiveInterrupts")) ||
      CONFIG.consecutiveInterrupts,
    interruptwindowMinutes:
      parseInt(props.getProperty("interruptwindowMinutes")) ||
      CONFIG.interruptwindowMinutes,
    minTotalOnBeforeConsider:
      parseInt(props.getProperty("minTotalOnBeforeConsider")) ||
      CONFIG.minTotalOnBeforeConsider,
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

/***********************
 * Paramètres et configuration
 ***********************/
const CONFIG = {
  // Seuils d’hystérésis
  thresholdOff: 2000, // éteint si surplus < 2000 W
  thresholdOn: 1800, // allume si surplus > 2000 W

  heaterPower: 3000, // puissance du chauffe-eau en W
  minOnMinutes: 30, // durée minimale ON
  minOffMinutes: 5, // durée minimale OFF

  // Limite quotidienne (minutes)
  dailyMaxMinutes: 180,
  // Durée minimale quotidienne garantie (minutes)
  minDailyMinutes: 120,

  // Heures creuses (exemple : 2h → 6h)
  hcStartHour: 2,
  hcEndHour: 6,

  // Paramètres de détection des interruptions
  powerThreshold: 100, // W
  noPowerMinutes: 8, // minutes
  consecutiveInterrupts: 3,
  interruptwindowMinutes: 30,
  minTotalOnBeforeConsider: 45,

  // ===== POMPE DE FILTRATION PISCINE =====
  pumpDeviceId: "", // ID du device Tuya pour la pompe
  pumpThresholdOn: 1500, // Seuil d'allumage pompe (W)
  pumpThresholdOff: 1000, // Seuil d'arrêt pompe (W)
  pumpPower: 1500, // Puissance pompe (W)
  pumpMinOnMinutes: 60, // Durée minimale de filtration continue
  pumpMinOffMinutes: 30, // Durée minimale d'arrêt
  pumpDailyMaxMinutes: 480, // Max 8h de filtration/jour
  pumpMinDailyMinutes: 240, // Min 4h de filtration/jour

  // ===== CHARGE VEHICULE ELECTRIQUE =====
  vehicleDeviceId: "", // ID du device Tuya pour la borne de charge
  vehicleMaxPower: 7000, // Puissance max de charge (W)
  // Note: La borne s'adapte automatiquement, pas de contrôle strict nécessaire
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

    // Pompe filtration piscine
    pumpDeviceId: props.getProperty("pumpDeviceId") || CONFIG.pumpDeviceId,
    pumpThresholdOn:
      parseInt(props.getProperty("pumpThresholdOn")) || CONFIG.pumpThresholdOn,
    pumpThresholdOff:
      parseInt(props.getProperty("pumpThresholdOff")) ||
      CONFIG.pumpThresholdOff,
    pumpPower: parseInt(props.getProperty("pumpPower")) || CONFIG.pumpPower,
    pumpMinOnMinutes:
      parseInt(props.getProperty("pumpMinOnMinutes")) ||
      CONFIG.pumpMinOnMinutes,
    pumpMinOffMinutes:
      parseInt(props.getProperty("pumpMinOffMinutes")) ||
      CONFIG.pumpMinOffMinutes,
    pumpDailyMaxMinutes:
      parseInt(props.getProperty("pumpDailyMaxMinutes")) ||
      CONFIG.pumpDailyMaxMinutes,
    pumpMinDailyMinutes:
      parseInt(props.getProperty("pumpMinDailyMinutes")) ||
      CONFIG.pumpMinDailyMinutes,

    // Véhicule électrique
    vehicleDeviceId:
      props.getProperty("vehicleDeviceId") || CONFIG.vehicleDeviceId,
    vehicleMaxPower:
      parseInt(props.getProperty("vehicleMaxPower")) || CONFIG.vehicleMaxPower,
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
      ensureCfg();
      return cfg; // ✅ getter dynamique
    },
    ensureCfg,
  };
}

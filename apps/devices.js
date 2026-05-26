/**
 * Gestion des appareils avec système de priorités
 * Appareils: 1. Chauffe-eau (priorité 1), 2. Pompe filtration (priorité 2), 3. Charge véhicule (priorité 3)
 */

if (typeof require !== "undefined") {
  var { ensureCfg } = require("./config.js");
}

/**
 * Définition des appareils avec leurs propriétés et priorités
 */
const DEVICES = {
  heater: {
    id: "heater",
    name: "Chauffe-eau",
    priority: 1, // Priorité 1 (la plus haute)
    type: "controllable", // controllable | smart_managed
  },
  pump: {
    id: "pump",
    name: "Pompe filtration piscine",
    priority: 2,
    type: "controllable",
  },
  vehicle: {
    id: "vehicle",
    name: "Charge véhicule électrique",
    priority: 3,
    type: "smart_managed", // La borne s'adapte automatiquement
  },
};

/**
 * Récupère la configuration d'un appareil
 * @param {string} deviceId - ID de l'appareil (heater, pump, vehicle)
 * @returns {Object} Configuration de l'appareil
 */
function getDeviceConfig(deviceId) {
  var cfg = ensureCfg();
  var deviceMap = {
    heater: {
      tuyadeviceId: cfg.deviceId,
      thresholdOn: cfg.thresholdOn,
      thresholdOff: cfg.thresholdOff,
      minOnMinutes: cfg.minOnMinutes,
      minOffMinutes: cfg.minOffMinutes,
      dailyMaxMinutes: cfg.dailyMaxMinutes,
      minDailyMinutes: cfg.minDailyMinutes,
      powerConsumption: cfg.heaterPower,
      hcStartHour: cfg.hcStartHour,
      hcEndHour: cfg.hcEndHour,
    },
    pump: {
      tuyadeviceId: cfg.pumpDeviceId,
      thresholdOn: cfg.pumpThresholdOn,
      thresholdOff: cfg.pumpThresholdOff,
      minOnMinutes: cfg.pumpMinOnMinutes,
      minOffMinutes: cfg.pumpMinOffMinutes,
      dailyMaxMinutes: cfg.pumpDailyMaxMinutes,
      minDailyMinutes: cfg.pumpMinDailyMinutes,
      powerConsumption: cfg.pumpPower,
      hcStartHour: cfg.hcStartHour,
      hcEndHour: cfg.hcEndHour,
    },
    vehicle: {
      // La borne charge véhicule n'a pas de limite stricte
      // elle s'adapte automatiquement à l'énergie disponible
      tuyadeviceId: cfg.vehicleDeviceId,
      powerConsumption: cfg.vehicleMaxPower, // Puissance max de charge
    },
  };

  return deviceMap[deviceId] || null;
}

/**
 * Retourne l'état sauvegardé d'un appareil
 * @param {Object} props - PropertiesService
 * @param {string} deviceId - ID de l'appareil
 * @returns {string} État: 'ON', 'OFF'
 */
function getDeviceState(props, deviceId) {
  var stateKey = deviceId.toUpperCase() + "_STATE";
  return props.getProperty(stateKey) || "OFF";
}

/**
 * Retourne la durée totale de fonctionnement d'un appareil aujourd'hui
 * @param {Object} props - PropertiesService
 * @param {string} deviceId - ID de l'appareil
 * @returns {number} Durée en minutes
 */
function getDeviceDailyMinutes(props, deviceId) {
  var dailyKey = deviceId.toUpperCase() + "_DAILY_MINUTES";
  return parseInt(props.getProperty(dailyKey) || "0");
}

/**
 * Met à jour l'état d'un appareil
 * @param {Object} props - PropertiesService
 * @param {string} deviceId - ID de l'appareil
 * @param {string} newState - 'ON' ou 'OFF'
 * @param {number} timestamp - Timestamp actuel
 */
function setDeviceState(props, deviceId, newState, timestamp) {
  var stateKey = deviceId.toUpperCase() + "_STATE";
  var lastChangeKey = deviceId.toUpperCase() + "_LAST_CHANGE";
  props.setProperty(stateKey, newState);
  props.setProperty(lastChangeKey, timestamp.toString());
}

/**
 * Met à jour la durée quotidienne d'un appareil
 * @param {Object} props - PropertiesService
 * @param {string} deviceId - ID de l'appareil
 * @param {number} minutes - Durée en minutes
 */
function setDeviceDailyMinutes(props, deviceId, minutes) {
  var dailyKey = deviceId.toUpperCase() + "_DAILY_MINUTES";
  props.setProperty(dailyKey, minutes.toString());
}

/**
 * Récupère le timestamp du dernier changement d'état
 * @param {Object} props - PropertiesService
 * @param {string} deviceId - ID de l'appareil
 * @returns {number} Timestamp en ms
 */
function getDeviceLastChange(props, deviceId) {
  var lastChangeKey = deviceId.toUpperCase() + "_LAST_CHANGE";
  return parseInt(props.getProperty(lastChangeKey) || "0");
}

/**
 * Calcule les minutes écoulées depuis le dernier changement d'état
 * @param {Object} props - PropertiesService
 * @param {string} deviceId - ID de l'appareil
 * @param {number} now - Timestamp actuel en ms
 * @returns {number} Durée en minutes
 */
function getDeviceMinutesSinceChange(props, deviceId, now) {
  var lastChange = getDeviceLastChange(props, deviceId);
  return (now - lastChange) / 60000;
}

/**
 * Réinitialise les compteurs quotidiens après HC
 * @param {Object} props - PropertiesService
 * @param {string} deviceId - ID de l'appareil
 */
function resetDeviceDailyCounter(props, deviceId) {
  setDeviceDailyMinutes(props, deviceId, 0);
}

// Export pour Jest
if (typeof module !== "undefined") {
  module.exports = {
    DEVICES,
    getDeviceConfig,
    getDeviceState,
    getDeviceDailyMinutes,
    setDeviceState,
    setDeviceDailyMinutes,
    getDeviceLastChange,
    getDeviceMinutesSinceChange,
    resetDeviceDailyCounter,
  };
}

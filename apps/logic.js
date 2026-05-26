if (typeof require !== "undefined") {
  var { ensureCfg, cfg } = require("./config.js");
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
  ensureCfg();

  var state = input.state;
  var surplus = input.surplus;
  var minutesSinceChange = input.minutesSinceChange;
  var dailyMinutes = input.dailyMinutes;
  var hour = input.hour;
  var opts = input.opts || {};

  var tOn =
    typeof opts.thresholdOn !== "undefined"
      ? opts.thresholdOn
      : cfg.thresholdOn;
  var tOff =
    typeof opts.thresholdOff !== "undefined"
      ? opts.thresholdOff
      : cfg.thresholdOff;
  var minOn =
    typeof opts.minOnMinutes !== "undefined"
      ? opts.minOnMinutes
      : cfg.minOnMinutes;
  var minOff =
    typeof opts.minOffMinutes !== "undefined"
      ? opts.minOffMinutes
      : cfg.minOffMinutes;
  var maxDaily =
    typeof opts.dailyMaxMinutes !== "undefined"
      ? opts.dailyMaxMinutes
      : cfg.dailyMaxMinutes;
  var minDaily =
    typeof opts.minDailyMinutes !== "undefined"
      ? opts.minDailyMinutes
      : cfg.minDailyMinutes;
  var hcStart =
    typeof opts.hcStartHour !== "undefined"
      ? opts.hcStartHour
      : cfg.hcStartHour;
  var hcEnd =
    typeof opts.hcEndHour !== "undefined" ? opts.hcEndHour : cfg.hcEndHour;

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

/*
 * Note une interruption de chauffe-eau et retourne le nombre d'interruptions
 * dans la fenêtre temporelle définie.
 * @param {Properties} props - objet PropertiesService.getScriptProperties()
 * @param {number} nowMs - timestamp actuel en ms
 * @returns {number} - nombre d'interruptions dans la fenêtre
 */
function noteInterruption(props, nowMs) {
  var arr = JSON.parse(props.getProperty("HEATER_INTERRUPT_TIMES") || "[]");
  arr.push(nowMs);
  // purge les timestamps hors fenêtre
  var cutoff = nowMs - cfg.interruptwindowMinutes * 60 * 1000;
  arr = arr.filter((t) => t >= cutoff);
  props.setProperty("HEATER_INTERRUPT_TIMES", JSON.stringify(arr));
  return arr.length;
}

/*
 * Vérifie si le chauffe-eau doit être arrêté pour la journée.
 * @param {Properties} props - objet PropertiesService.getScriptProperties()
 * @param {number} dailyMinutes - minutes ON aujourd'hui
 * @param {number} nowMs - timestamp actuel en ms
 * @returns {boolean} - true si doit arrêter, false sinon
 */
function checkIfShouldStopForDay(props, dailyMinutes, nowMs) {
  // règles pour arrêter la chauffe pour la journée
  // condition 1: goal atteint
  if (dailyMinutes >= cfg.dailyMaxMinutes) return true;

  // condition 2: total on enough + interruptions recent >= threshold
  if (dailyMinutes < cfg.minTotalOnBeforeConsider) return false;
  var arr = JSON.parse(props.getProperty("HEATER_INTERRUPT_TIMES") || "[]");
  return arr.length >= cfg.consecutiveInterrupts;
}

// Si tu veux tester avec Jest
/**
 * Prend une décision pour un appareil spécifique selon sa priorité
 * @param {string} deviceId - ID de l'appareil ('heater', 'pump', 'vehicle')
 * @param {Object} input - Données pour la décision
 * @returns {Object} { action: 'ON'|'OFF'|'NONE', reason: string }
 */
function decideDeviceAction(deviceId, input) {
  ensureCfg();
  var fallback = cfg || CONFIG;

  // Le chauffe-eau (priorité 1) utilise la logique existante
  if (deviceId === "heater") {
    return decideHeaterAction(input);
  }

  // La pompe (priorité 2) a une logique similaire mais secondaire
  if (deviceId === "pump") {
    // La pompe ne fonctionne que si chauffe-eau est OFF et surplus suffisant
    // Récupère les seuils de la pompe depuis input.opts ou fallback
    var state = input.state;
    var surplus = input.surplus;
    var minutesSinceChange = input.minutesSinceChange;
    var dailyMinutes = input.dailyMinutes;
    var hour = input.hour;
    var opts = input.opts || {};

    var tOn = opts.pumpThresholdOn || fallback.pumpThresholdOn || 1500;
    var tOff = opts.pumpThresholdOff || fallback.pumpThresholdOff || 1000;
    var minOn =
      opts.pumpMinOnMinutes || fallback.pumpMinOnMinutes || 60;
    var minOff =
      opts.pumpMinOffMinutes || fallback.pumpMinOffMinutes || 30;
    var maxDaily =
      opts.pumpDailyMaxMinutes || fallback.pumpDailyMaxMinutes || 480;
    var minDaily =
      opts.pumpMinDailyMinutes || fallback.pumpMinDailyMinutes || 240;

    // Si heater est ON, pompe doit rester OFF
    if (input.heaterState === "ON") {
      return { action: "OFF", reason: "heater_priority" };
    }

    // Vérifier les limites quotidiennes
    if (dailyMinutes >= maxDaily) {
      return { action: "OFF", reason: "daily_limit" };
    }

    // Décision basée sur surplus
    if (state === "ON") {
      // Reste ON si surplus suffisant et min durée pas atteinte
      if (surplus > tOff && minutesSinceChange < minOn) {
        return { action: "NONE", reason: "pump_stay_on" };
      }
      // OFF si surplus trop bas
      if (surplus < tOff) {
        return { action: "OFF", reason: "low_surplus" };
      }
      // Reste ON sinon
      return { action: "NONE", reason: "pump_continue" };
    } else {
      // OFF: ne démarre que si surplus suffisant ET min durée OFF écoulée
      if (surplus > tOn && minutesSinceChange >= minOff) {
        // Mais pas si daily min pas atteint et pas heures creuses
        if (
          dailyMinutes < minDaily &&
          hour >= fallback.hcEndHour &&
          hour < fallback.hcStartHour
        ) {
          return { action: "NONE", reason: "too_early_for_min_daily" };
        }
        return { action: "ON", reason: "surplus_available" };
      }
      return { action: "NONE", reason: "insufficient_surplus" };
    }
  }

  // Véhicule (priorité 3): charge automatiquement
  if (deviceId === "vehicle") {
    // La borne s'adapte automatiquement
    // On ne contrôle pas l'ordre: elle charge si energiesolaire restante
    // La logique de contrôle du véhicule sera dans main.js
    return { action: "AUTO", reason: "vehicle_smart_managed" };
  }

  return { action: "NONE", reason: "unknown_device" };
}

if (typeof module !== "undefined") {
  module.exports = {
    decideHeaterAction,
    decideDeviceAction,
    noteInterruption,
    checkIfShouldStopForDay,
  };
}

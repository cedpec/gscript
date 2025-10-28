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
    typeof opts.thresholdOn !== "undefined"
      ? opts.thresholdOn
      : CONFIG.thresholdOn;
  var tOff =
    typeof opts.thresholdOff !== "undefined"
      ? opts.thresholdOff
      : CONFIG.thresholdOff;
  var minOn =
    typeof opts.minOnMinutes !== "undefined"
      ? opts.minOnMinutes
      : CONFIG.minOnMinutes;
  var minOff =
    typeof opts.minOffMinutes !== "undefined"
      ? opts.minOffMinutes
      : CONFIG.minOffMinutes;
  var maxDaily =
    typeof opts.dailyMaxMinutes !== "undefined"
      ? opts.dailyMaxMinutes
      : CONFIG.dailyMaxMinutes;
  var minDaily =
    typeof opts.minDailyMinutes !== "undefined"
      ? opts.minDailyMinutes
      : CONFIG.minDailyMinutes;
  var hcStart =
    typeof opts.hcStartHour !== "undefined"
      ? opts.hcStartHour
      : CONFIG.hcStartHour;
  var hcEnd =
    typeof opts.hcEndHour !== "undefined" ? opts.hcEndHour : CONFIG.hcEndHour;

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

// Si tu veux tester avec Jest
if (typeof module !== "undefined") {
  module.exports = { decideHeaterAction };
}

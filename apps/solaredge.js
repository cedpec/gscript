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

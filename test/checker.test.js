const path = require("path");
const fs = require("fs");

// Load mocks
require("../lib/gas-mock");

const { ensureCfg } = require("../apps/config.js");

const props = PropertiesService.getScriptProperties();
props.setProperty("DRY_RUN", "true");
props.setProperty("TUYA_HOST", "https://example.com");
props.setProperty("TUYA_ACCESS_ID", "id");
props.setProperty("TUYA_ACCESS_SECRET", "secret");
props.setProperty("TUYA_DEVICE_ID", "dev");

// ensure cfg is initialized
ensureCfg();

const { sendCommand } = require("../apps/tuya.js");

describe("main.js basic tests", () => {
  // let code;
  beforeAll(() => {});

  test("dry-run prevents UrlFetchApp.fetch in sendCommand", () => {
    const token = "fake";
    const res = sendCommand("dev", token, true);
    expect(res).toMatch(/simulated/);
  });
});

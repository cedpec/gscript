const path = require("path");
const fs = require("fs");

// Load mocks
require("../lib/gas-mock");

describe("Code.js basic tests", () => {
  let code;
  beforeAll(() => {
  const codePath = path.join(__dirname, "..", "apps", "Code.js");
    const content = fs.readFileSync(codePath, "utf8");
    // Evaluate the script in the current node context (mocks available)
    eval(content);
    // expose the functions we need to the global object (eval defines them in module scope)
    global.ensureCfg = typeof ensureCfg !== "undefined" ? ensureCfg : null;
    global.sendCommand =
      typeof sendCommand !== "undefined" ? sendCommand : null;
    code = global;
  });

  test("dry-run prevents UrlFetchApp.fetch in sendCommand", () => {
    const props = PropertiesService.getScriptProperties();
    props.setProperty("DRY_RUN", "true");
    props.setProperty("TUYA_HOST", "https://example.com");
    props.setProperty("TUYA_ACCESS_ID", "id");
    props.setProperty("TUYA_ACCESS_SECRET", "secret");
    props.setProperty("TUYA_DEVICE_ID", "dev");

    // ensure cfg is initialized
    ensureCfg();
    const token = "fake";
    const res = sendCommand("dev", token, true);
    expect(res).toMatch(/simulated/);
  });
});

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

// Mock de la fonction getSolarPowerAvailable
jest.mock("../apps/solaredge.js", () => ({
  getSolarPowerAvailable: jest.fn(() => {
    return 100;
  }),
}));

// 🧩 Mock de tuya.js AVANT d'importer main.js
jest.mock("../apps/tuya.js", () => ({
  getDeviceStatus: jest.fn(() => [
    { code: "cur_current", value: 50 },
    { code: "switch", value: true },
  ]),
  sendCommand: jest.fn(),
  getValidToken: jest.fn(() => "fake_token"),
}));

// Mock noteInterruption et checkIfShouldStopForDay
jest.mock("../apps/logic.js", () => ({
  ...jest.requireActual("../apps/logic.js"),
  noteInterruption: jest.fn((props, now) => {
    const nb = parseInt(props.getProperty("HEATER_NB_INTERRUPTION") || "0") + 1;
    props.setProperty("HEATER_NB_INTERRUPTION", nb.toString());
    return nb;
  }),
  checkIfShouldStopForDay: jest.fn(() => false),
}));

const {
  noteInterruption,
  checkIfShouldStopForDay,
} = require("../apps/logic.js");
const { getDeviceStatus } = require("../apps/tuya.js");
const { checkSolarAndControlHeater } = require("../apps/main.js");

// Configuration globale simulée
beforeAll(() => {
  global.CONFIG = require("../apps/config.js").CONFIG;
});

describe("checkSolarAndControlHeater - détection des interruptions de chauffe", () => {
  let props;
  let logs = [];

  beforeEach(() => {
    logs = [];

    global.Logger = {
      log: (msg) =>
        logs.push(typeof msg === "string" ? msg : JSON.stringify(msg)),
    };

    // --- Mock PropertiesService cohérent avec ton écosystème
    const data = {};
    props = {
      data,
      getProperty: jest.fn((key) => props.data[key]),
      setProperty: jest.fn((key, value) => (props.data[key] = value)),
      deleteProperty: jest.fn((key) => delete props.data[key]),
    };

    global.PropertiesService = {
      getScriptProperties: () => props,
    };

    // --- Mocks des dépendances
    global.ensureCfg = jest.fn();
    global.getValidToken = jest.fn(() => "fake_token");
    global.sendCommand = jest.fn();
    global.creerDeclencheur = jest.fn();
    global.supprimerDeclencheur = jest.fn();

    global.cfg = {
      deviceId: "dev123",
      powerThreshold: 100,
    };

    // On fixe la durée "sans consommation" à 5 min
    global.NO_POWER_MINUTES = 5;

    // Simulation de CONFIG global
    global.CONFIG = { hcEndHour: 7, heaterPower: 2000 };

    // Mock device status — ajusté test par test
    global.extractCodeValue = (arr, code) =>
      arr.find((x) => x.code === code)?.value ?? null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("crée un marqueur HEATER_NO_POWER_SINCE quand la conso devient < seuil", () => {
    props.data = {
      HEATER_STATE: "ON",
      LAST_CHANGE: Date.now().toString(),
      DAILY_MINUTES: "0",
    };

    getDeviceStatus.mockReturnValueOnce([
      { code: "cur_current", value: 50 },
      { code: "switch", value: true },
    ]);

    checkSolarAndControlHeater();

    expect(props.setProperty).toHaveBeenCalledWith(
      "HEATER_NO_POWER_SINCE",
      expect.any(String),
    );
    expect(logs.some((l) => l.includes("cur_current"))).toBeFalsy(); // pas d’erreur
  });

  test("détecte une interruption confirmée après durée minimale", () => {
    const now = Date.now();
    const earlier = now - 10 * 60 * 1000; // 10 min avant

    props.data = {
      HEATER_STATE: "ON",
      LAST_CHANGE: earlier.toString(),
      HEATER_NO_POWER_SINCE: earlier.toString(),
      DAILY_MINUTES: "0",
    };

    getDeviceStatus.mockReturnValueOnce([
      { code: "cur_current", value: 20 },
      { code: "switch", value: true },
    ]);

    checkSolarAndControlHeater();

    // ✅ Une interruption doit être notée
    expect(noteInterruption).toHaveBeenCalledWith(props, expect.any(Number));
    expect(props.deleteProperty).toHaveBeenCalledWith("HEATER_NO_POWER_SINCE");
    expect(logs.some((l) => l.includes("Interruption confirmée"))).toBeTruthy();
  });

  test("appelle checkIfShouldStopForDay après interruption confirmée", () => {
    const now = Date.now();
    const earlier = now - 10 * 60 * 1000;

    props.data = {
      HEATER_STATE: "ON",
      LAST_CHANGE: earlier.toString(),
      HEATER_NO_POWER_SINCE: earlier.toString(),
      DAILY_MINUTES: "120",
    };

    getDeviceStatus.mockReturnValueOnce([
      { code: "cur_current", value: 0 },
      { code: "switch", value: true },
    ]);

    checkIfShouldStopForDay.mockReturnValue(true);

    checkSolarAndControlHeater();

    expect(checkIfShouldStopForDay).toHaveBeenCalledWith(
      props,
      120,
      expect.any(Number),
    );
    expect(
      logs.some((l) =>
        l.includes("Considérer la chauffe comme terminée pour aujourd'hui"),
      ),
    ).toBeTruthy();
  });
});

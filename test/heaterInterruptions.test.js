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

// Mock du temps
global.Date = class extends Date {
  static now() {
    return 1_000_000_000_000;
  }
};

// Simule un statut Tuya
const mockDeviceStatus = (cur_current) => [
  { code: "cur_current", value: cur_current },
  { code: "switch", value: true },
];

// Mocks pour Tuya et SolarEdge
jest.mock("../apps/tuya.js", () => ({
  getValidToken: jest.fn(() => "fake-token"),
  getDeviceStatus: jest.fn(() => [
    { code: "cur_current", value: 50 },
    { code: "switch", value: true },
  ]),
}));

jest.mock("../apps/solaredge.js", () => ({
  getSolarPowerAvailable: jest.fn(() => 4000),
}));

jest.mock("../apps/utils.js", () => ({
  extractCodeValue: jest.fn((arr, code) => {
    const found = arr.find((s) => s.code === code);
    return found ? found.value : null;
  }),
}));

// Mock noteInterruption et checkIfShouldStopForDay
jest.mock("../apps/logic.js", () => ({
  decideHeaterAction: jest.fn(() => ({ action: "NONE", reason: "test" })),
  noteInterruption: jest.fn(() => 35),
  checkIfShouldStopForDay: jest.fn(() => true),
}));

const { checkSolarAndControlHeater } = require("../apps/main.js");

// Configuration globale simulée
beforeAll(() => {
  global.CONFIG = require("../apps/config.js").CONFIG;
});

describe("Gestion des interruptions chauffe-eau", () => {
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
    props.data = {
      HEATER_STATE: "ON",
      HEATER_NB_INTERRUPTION: "0",
      DAILY_MINUTES: "100",
      LAST_CHECK: "0",
      LAST_CHANGE: (Date.now() - 10 * 60 * 1000).toString(), // il y a 10 minutes
      HEATER_NO_POWER_SINCE: (Date.now() - 10 * 60 * 1000).toString(), // il y a 10 minutes
    };
    jest.clearAllMocks();
  });

  test("📉 détecte une interruption quand la consommation < seuil", () => {
    const { getDeviceStatus } = require("../apps/tuya.js");
    getDeviceStatus.mockReturnValue(mockDeviceStatus(50)); // inférieur au seuil

    checkSolarAndControlHeater();

    const { noteInterruption } = require("../apps/logic.js");
    expect(noteInterruption).toHaveBeenCalled();
    expect(logs.some((l) => l.includes("Interruption confirmée"))).toBeTruthy();
  });

  test("🚫 ne déclenche rien quand la consommation > seuil", () => {
    const { getDeviceStatus } = require("../apps/tuya.js");
    getDeviceStatus.mockReturnValue(mockDeviceStatus(500)); // supérieur au seuil

    checkSolarAndControlHeater();

    const { noteInterruption } = require("../apps/logic.js");
    expect(noteInterruption).not.toHaveBeenCalled();
  });

  test("🧮 après plusieurs interruptions, on appelle checkIfShouldStopForDay", () => {
    const { getDeviceStatus } = require("../apps/tuya.js");
    getDeviceStatus.mockReturnValue(mockDeviceStatus(50)); // faible conso
    const { checkIfShouldStopForDay } = require("../apps/logic.js");

    // Simule déjà plusieurs interruptions précédentes
    global.PropertiesService.getScriptProperties().setProperty(
      "HEATER_NB_INTERRUPTION",
      "35",
    );

    checkSolarAndControlHeater();

    expect(checkIfShouldStopForDay).toHaveBeenCalled();
    expect(
      logs.some((l) => l.includes("Considérer la chauffe comme terminée")),
    ).toBeTruthy();
  });
});

// Load mocks
require("../lib/gas-mock");

const { mockDate, restoreDate } = require("./utils/dateMock");
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

const { checkSolarAndControlHeater } = require("../apps/main.js");

beforeAll(() => {
  global.CONFIG = require("../apps/config.js").CONFIG;
});

describe("checkSolarAndControlHeater - réinitialisation quotidienne", () => {
  let props;
  let logs = [];

  beforeEach(() => {
    logs = [];
    global.Logger = {
      log: (msg) =>
        logs.push(typeof msg === "string" ? msg : JSON.stringify(msg)),
    };
    props = {
      data: {},
      getProperty: jest.fn((key) => props.data[key]),
      setProperty: jest.fn((key, value) => (props.data[key] = value)),
    };
    global.PropertiesService = {
      getScriptProperties: () => props,
    };

    // Mocks des dépendances inutiles au test
    global.ensureCfg = jest.fn(() => {});
    global.getValidToken = jest.fn(() => "fake_token");
    global.getDeviceStatus = jest.fn(() => null);
    global.extractCodeValue = jest.fn(() => null);
    global.sendCommand = jest.fn();
    global.decideHeaterAction = jest.fn(() => ({
      action: "NONE",
      reason: "test",
    }));
    global.creerDeclencheur = jest.fn();
    global.supprimerDeclencheur = jest.fn();
    global.cfg = { deviceId: "dummy" };

    // Simulation de CONFIG global
    global.CONFIG = { hcEndHour: 7 };
  });

  afterEach(() => {
    restoreDate();
    jest.restoreAllMocks();
  });

  test("réinitialise le compteur après heure creuse quand conditions remplies", () => {
    mockDate("2025-10-30T08:00:00Z", 8);
    // 🧩 Données initiales simulant un changement de jour après HC
    props.data = {
      HEATER_STATE: "OFF",
      LAST_DATE: "Wed Oct 29 2025",
      HEATER_NB_INTERRUPTION: "3",
      DAILY_MINUTES: "125",
    };

    checkSolarAndControlHeater();

    // ✅ Vérifications
    expect(props.setProperty).toHaveBeenCalledWith(
      "LAST_DATE",
      expect.any(String),
    );
    expect(props.setProperty).toHaveBeenCalledWith(
      "HEATER_NB_INTERRUPTION",
      "0",
    );
    expect(props.setProperty).toHaveBeenCalledWith("DAILY_MINUTES", "0");
    expect(
      logs.some((l) => l.includes("Compteur quotidien réinitialisé")),
    ).toBeTruthy();
    expect(
      logs.some((l) =>
        l.includes("Réinitialisation du compteur d'interruptions"),
      ),
    ).toBeTruthy();
  });

  test("ne réinitialise pas si heure avant fin HC", () => {
    mockDate("2025-10-30T04:00:00Z", 4);

    props.data = {
      HEATER_STATE: "OFF",
      LAST_DATE: "Wed Oct 29 2025",
      DAILY_MINUTES: "90",
    };

    checkSolarAndControlHeater();

    expect(props.setProperty).not.toHaveBeenCalledWith(
      "LAST_DATE",
      expect.any(String),
    );
    expect(
      logs.some((l) => l.includes("Compteur quotidien réinitialisé")),
    ).toBeFalsy();
  });

  test("ne réinitialise pas si chauffe-eau ON", () => {
    mockDate("2025-10-30T06:00:00Z", 6);
    props.data = {
      HEATER_STATE: "ON",
      LAST_DATE: "Wed Oct 29 2025",
      DAILY_MINUTES: "90",
    };

    checkSolarAndControlHeater();

    expect(props.setProperty).not.toHaveBeenCalledWith(
      "LAST_DATE",
      expect.any(String),
    );
  });

  test("ajuste le surplus si le chauffe-eau est ON", () => {
    const logs = [];
    global.Logger = {
      log: (msg) =>
        logs.push(typeof msg === "string" ? msg : JSON.stringify(msg)),
    };

    // Configuration globale simulée
    global.CONFIG = { hcEndHour: 6, heaterPower: 2000 }; // <== la puissance simulée du chauffe-eau en watts
    global.ensureCfg = () => {};
    global.cfg = { deviceId: "abc" };

    // Fonctions externes nécessaires
    global.getValidToken = () => "token";
    global.getDeviceStatus = () => [{ code: "switch", value: true }];
    global.extractCodeValue = (arr, code) =>
      arr.find((x) => x.code === code)?.value ?? null;
    global.sendCommand = jest.fn();
    global.creerDeclencheur = jest.fn();
    global.supprimerDeclencheur = jest.fn();
    global.decideHeaterAction = () => ({ action: "NONE", reason: "test" });

    // Mock PropertiesService
    const props = new Map();
    global.PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (key) => props.get(key),
        setProperty: (key, value) => props.set(key, value),
      }),
    };

    // Simule un état ON
    props.set("HEATER_STATE", "ON");
    props.set("LAST_DATE", new Date().toDateString());
    props.set("LAST_CHANGE", Date.now().toString());

    // Exécute la fonction principale
    checkSolarAndControlHeater();

    // Récupère le log contenant la valeur de surplus après ajustement
    const logObjet = logs.find((l) => l.includes('"surplus"'));

    // Parse pour extraire la valeur réelle (car JSON.stringify)
    const surplusFinal = JSON.parse(logObjet).surplus;

    // Vérifie que le surplus a bien été augmenté de heaterPower
    expect(surplusFinal).toBe(100 + 2000);
  });

  test("ne modifie pas le surplus si le chauffe-eau est OFF", () => {
    const logs = [];
    global.Logger = {
      log: (msg) =>
        logs.push(typeof msg === "string" ? msg : JSON.stringify(msg)),
    };

    global.CONFIG = { hcEndHour: 6 };
    global.ensureCfg = () => {};
    global.cfg = { deviceId: "abc" };
    global.heaterPower = 2000;

    global.getValidToken = () => "token";
    global.getDeviceStatus = () => [{ code: "switch", value: false }];
    global.extractCodeValue = (arr, code) =>
      arr.find((x) => x.code === code)?.value ?? null;
    global.sendCommand = jest.fn();
    global.creerDeclencheur = jest.fn();
    global.supprimerDeclencheur = jest.fn();
    global.decideHeaterAction = () => ({ action: "NONE", reason: "test" });

    const props = new Map();
    global.PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (key) => props.get(key),
        setProperty: (key, value) => props.set(key, value),
      }),
    };

    props.set("HEATER_STATE", "OFF");
    props.set("LAST_DATE", new Date().toDateString());
    props.set("LAST_CHANGE", Date.now().toString());

    checkSolarAndControlHeater();

    const logObjet = logs.find((l) => l.includes('"surplus"'));
    const surplusFinal = JSON.parse(logObjet).surplus;

    expect(surplusFinal).toBe(100);
  });
});

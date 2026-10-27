require("../lib/gas-mock");

const {
  exchangeSolarEdgeAuthorizationCode,
  setupSolarEdgeTrigger,
  refreshSolarPowerCache,
  getSolarPowerAvailable,
} = require("../apps/solaredge.js");

const props = PropertiesService.getScriptProperties();
const now = new Date("2026-06-15T10:00:00Z").getTime();

function mockTime(timestamp, hour) {
  jest.spyOn(Date, "now").mockReturnValue(timestamp);
  jest.spyOn(Date.prototype, "getHours").mockReturnValue(hour);
}

function mockResponse(status, body) {
  return {
    getResponseCode: () => status,
    getContentText: () => JSON.stringify(body),
  };
}

beforeEach(() => {
  props.store = {};
  Logger.logs = [];
  jest.spyOn(UrlFetchApp, "fetch");
  mockTime(now, 10);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("OAuth SolarEdge", () => {
  test("exchanges a manually entered code immediately without storing it", () => {
    props.setProperty("SOLAREDGE_CLIENT_ID", "client");
    props.setProperty("SOLAREDGE_CLIENT_SECRET", "secret");
    props.setProperty("SITE_ID", "12345");
    props.setProperty(
      "SOLAREDGE_REDIRECT_URI",
      "https://example.com/oauth/callback",
    );
    jest.spyOn(UrlFetchApp, "fetch").mockReturnValue(
      mockResponse(200, {
        access_token: "access",
        refresh_token: "refresh",
        expires_in: 7200,
      }),
    );

    expect(exchangeSolarEdgeAuthorizationCode("  one-time-code  ")).toBe(true);
    expect(UrlFetchApp.fetch).toHaveBeenCalledWith(
      "https://monitoringapi.solaredge.com/v2/oauth2/token",
      expect.objectContaining({
        payload: JSON.stringify({
          grant_type: "authorization_code",
          client_id: "client",
          client_secret: "secret",
          code: "one-time-code",
          redirect_uri: "https://example.com/oauth/callback",
        }),
      }),
    );
    expect(props.getProperty("SOLAREDGE_ACCESS_TOKEN")).toBe("access");
    expect(props.getProperty("SOLAREDGE_REFRESH_TOKEN")).toBe("refresh");
    expect(props.getProperty("SOLAREDGE_AUTHORIZATION_CODE")).toBe(null);
  });

  test("requires the exact redirect URI used in the authorization request", () => {
    props.setProperty("SOLAREDGE_CLIENT_ID", "client");
    props.setProperty("SOLAREDGE_CLIENT_SECRET", "secret");
    props.setProperty("SITE_ID", "12345");

    expect(() => exchangeSolarEdgeAuthorizationCode("one-time-code")).toThrow(
      "SOLAREDGE_REDIRECT_URI manquant",
    );
    expect(UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  test("rejects an empty manual authorization code", () => {
    expect(() => exchangeSolarEdgeAuthorizationCode("  ")).toThrow(
      "Code d'autorisation SolarEdge manquant",
    );
    expect(UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  test("shows SolarEdge's OAuth error without exposing credentials or code", () => {
    props.setProperty("SOLAREDGE_CLIENT_ID", "client");
    props.setProperty("SOLAREDGE_CLIENT_SECRET", "secret");
    props.setProperty("SITE_ID", "12345");
    props.setProperty(
      "SOLAREDGE_REDIRECT_URI",
      "https://example.com/oauth/callback",
    );
    jest.spyOn(UrlFetchApp, "fetch").mockReturnValue({
      getResponseCode: () => 400,
      getContentText: () =>
        JSON.stringify({
          error: "invalid_grant",
          error_description: "Code one-time-code is expired",
        }),
    });

    try {
      exchangeSolarEdgeAuthorizationCode("one-time-code");
      throw new Error("Expected authorization exchange to fail");
    } catch (error) {
      expect(error.message).toContain("HTTP 400");
      expect(error.message).toContain("invalid_grant");
      expect(error.message).toContain("[masqué] is expired");
      expect(error.message).not.toContain("one-time-code");
      expect(error.message).not.toContain("secret");
    }
  });
});

describe("SolarEdge quota and telemetry cache", () => {
  test("refreshes once, rotates the token and caches the latest quarter-hour powers", () => {
    props.setProperty("SOLAREDGE_CLIENT_ID", "client");
    props.setProperty("SOLAREDGE_CLIENT_SECRET", "secret");
    props.setProperty("SOLAREDGE_REFRESH_TOKEN", "refresh-old");
    props.setProperty("SOLAREDGE_ACCESS_TOKEN_EXPIRES_AT", "0");
    props.setProperty("SITE_ID", "12345");
    jest
      .spyOn(UrlFetchApp, "fetch")
      .mockReturnValueOnce(
        mockResponse(200, {
          access_token: "access-new",
          refresh_token: "refresh-new",
          expires_in: 7200,
        }),
      )
      .mockReturnValueOnce(
        mockResponse(200, {
          period: { from: "2026-06-15T09:45:00Z", to: "2026-06-15T10:00:00Z" },
          resolution: "QUARTER_HOUR",
          meters: {
            606945809: {
              importEnergy: { unit: "Wh", values: [] },
              importPower: {
                unit: "W",
                values: [
                  { timestamp: "2026-06-15T09:45:00Z", value: 2000 },
                  { timestamp: "2026-06-15T10:00:00Z", value: 2500 },
                ],
              },
              exportEnergy: { unit: "Wh", values: [] },
              exportPower: {
                unit: "W",
                values: [
                  { timestamp: "2026-06-15T09:45:00Z", value: 5000 },
                  { timestamp: "2026-06-15T10:00:00Z", value: 6000 },
                ],
              },
            },
            CONSUMPTION: {
              consumptionEnergy: { unit: "Wh", values: [] },
              consumptionPower: {
                unit: "W",
                values: [{ timestamp: "2026-06-15T10:00:00Z", value: 3500 }],
              },
            },
          },
        }),
      );

    expect(refreshSolarPowerCache()).toBe(3500);
    expect(getSolarPowerAvailable()).toBe(3500);
    expect(props.getProperty("SOLAREDGE_REFRESH_TOKEN")).toBe("refresh-new");
    expect(UrlFetchApp.fetch).toHaveBeenCalledTimes(2);
    expect(UrlFetchApp.fetch.mock.calls[1][0]).toContain(
      "/v2/sites/12345/meters/telemetry?resolution=QUARTER_HOUR",
    );
    expect(UrlFetchApp.fetch.mock.calls[1][1].headers.Authorization).toBe(
      "Bearer access-new",
    );

    mockTime(now + 60 * 1000, 10);
    expect(refreshSolarPowerCache()).toBe(3500);
    expect(UrlFetchApp.fetch).toHaveBeenCalledTimes(2);
  });

  test("does not call SolarEdge outside the configured window", () => {
    mockTime(now, 17);
    expect(refreshSolarPowerCache()).toBe(0);
    expect(UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  test("skips an overlapping refresh while another execution holds the lock", () => {
    const tryLock = jest.fn(() => false);
    global.LockService = {
      getScriptLock: () => ({ tryLock, releaseLock: jest.fn() }),
    };

    expect(refreshSolarPowerCache()).toBe(0);
    expect(tryLock).toHaveBeenCalledWith(1000);
    expect(UrlFetchApp.fetch).not.toHaveBeenCalled();
  });

  test("does not return an expired cached measurement", () => {
    props.setProperty("SOLAREDGE_POWER_SURPLUS", "4000");
    props.setProperty(
      "SOLAREDGE_POWER_UPDATED_AT",
      (now - 31 * 60 * 1000).toString(),
    );

    expect(getSolarPowerAvailable()).toBe(0);
  });

  test("creates one 15-minute trigger after removing previous ones", () => {
    const oldTrigger = { getHandlerFunction: () => "refreshSolarPowerCache" };
    const unrelatedTrigger = { getHandlerFunction: () => "otherHandler" };
    const create = jest.fn();
    const everyMinutes = jest.fn(() => ({ create }));
    const timeBased = jest.fn(() => ({ everyMinutes }));
    global.ScriptApp = {
      getProjectTriggers: () => [oldTrigger, unrelatedTrigger],
      deleteTrigger: jest.fn(),
      newTrigger: jest.fn(() => ({ timeBased })),
    };

    setupSolarEdgeTrigger();

    expect(ScriptApp.deleteTrigger).toHaveBeenCalledWith(oldTrigger);
    expect(ScriptApp.deleteTrigger).not.toHaveBeenCalledWith(unrelatedTrigger);
    expect(ScriptApp.newTrigger).toHaveBeenCalledWith("refreshSolarPowerCache");
    expect(everyMinutes).toHaveBeenCalledWith(15);
    expect(create).toHaveBeenCalled();
  });
});

// Load mocks
require("../lib/gas-mock");

const { decideHeaterAction } = require("../apps/logic.js");

beforeAll(() => {
  global.CONFIG = require("../apps/config.js").CONFIG;
});

describe("decideHeaterAction", () => {
  test("turn ON when surplus > thresholdOn and minOff passed", () => {
    const res = decideHeaterAction({
      state: "OFF",
      surplus: 4000,
      minutesSinceChange: 20,
      dailyMinutes: 0,
      hour: 12,
      opts: { thresholdOn: 3000, minOffMinutes: 15 },
    });
    expect(res.action).toBe("ON");
  });

  test("stay OFF if minOff not passed", () => {
    const res = decideHeaterAction({
      state: "OFF",
      surplus: 4000,
      minutesSinceChange: 10,
      dailyMinutes: 0,
      hour: 12,
      opts: { thresholdOn: 3000, minOffMinutes: 15 },
    });
    expect(res.action).toBe("NONE");
  });

  test("turn OFF when surplus < thresholdOff and minOn passed", () => {
    const res = decideHeaterAction({
      state: "ON",
      surplus: 1000,
      minutesSinceChange: 40,
      dailyMinutes: 0,
      hour: 12,
      opts: { thresholdOff: 2000, minOnMinutes: 30 },
    });
    expect(res.action).toBe("OFF");
  });

  test("force ON in HC when dailyMinutes < minDaily", () => {
    const res = decideHeaterAction({
      state: "OFF",
      surplus: 0,
      minutesSinceChange: 0,
      dailyMinutes: 10,
      hour: 3,
      opts: { hcStartHour: 2, hcEndHour: 5, minDailyMinutes: 90 },
    });
    expect(res.action).toBe("ON");
  });

  test("prevent ON when daily limit reached", () => {
    const res = decideHeaterAction({
      state: "OFF",
      surplus: 10000,
      minutesSinceChange: 100,
      dailyMinutes: 200,
      hour: 12,
      opts: { dailyMaxMinutes: 120 },
    });
    expect(res.action).toBe("NONE");
  });
});

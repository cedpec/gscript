/**
 * Mock propre de Date pour Jest.
 *
 * Exemple :
 *   const { mockDate, restoreDate } = require("./utils/dateMock");
 *   mockDate("2025-10-30T08:00:00Z", 8);
 *   ...
 *   restoreDate();
 */

let RealDate;

/**
 * Mocke le constructeur Date pour retourner toujours la même date/heure.
 * @param {string} isoString - date ISO (ex: "2025-10-30T08:00:00Z")
 * @param {number} [hour] - optionnel, force la valeur de getHours()
 */
function mockDate(isoString, hour) {
  RealDate = Date;

  jest.spyOn(global, "Date").mockImplementation(() => {
    const d = new RealDate(isoString);
    if (hour !== undefined) {
      d.getHours = () => hour;
    }
    return d;
  });

  // ✅ préserve Date.now() et autres méthodes statiques
  global.Date.now = RealDate.now;
  global.Date.parse = RealDate.parse;
  global.Date.UTC = RealDate.UTC;
}

/**
 * Restaure le comportement normal de Date.
 */
function restoreDate() {
  if (RealDate) {
    global.Date = RealDate;
    RealDate = undefined;
  }
}

module.exports = { mockDate, restoreDate };

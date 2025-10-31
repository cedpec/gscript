// Minimal mocks for Google Apps Script environment used in tests
// Singleton script properties mock
var _scriptProperties = {
  store: {},
  getProperty: function (k) {
    return this.store.hasOwnProperty(k) ? this.store[k] : null;
  },
  setProperty: function (k, v) {
    this.store[k] = v;
  },
  deleteProperty: function (k) {
    delete this.store[k];
  },
};

global.PropertiesService = {
  getScriptProperties: function () {
    return _scriptProperties;
  },
};

global.Logger = {
  logs: [],
  log: function () {
    this.logs.push(Array.from(arguments).join(" "));
  },
};

global.Utilities = {
  DigestAlgorithm: { SHA_256: "SHA_256" },
  Charset: { UTF_8: "UTF_8" },
  computeDigest: function (alg, str, charset) {
    // simple mock: return array of bytes from char codes
    var bytes = [];
    for (var i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i) % 256);
    return bytes;
  },
  computeHmacSha256Signature: function (message, secret, charset) {
    var bytes = [];
    var s = message + "::" + secret;
    for (var i = 0; i < s.length; i++) bytes.push(s.charCodeAt(i) % 256);
    return bytes;
  },
  getUuid: function () {
    return "mock-uuid" + Math.floor(Math.random() * 1000);
  },
};

global.UrlFetchApp = {
  fetch: function (url, opts) {
    // Default mock: return object with getResponseCode/getContentText
    return {
      getResponseCode: function () {
        return 200;
      },
      getContentText: function () {
        return JSON.stringify({
          success: true,
          result: { access_token: "tok", expire_time: 3600 },
        });
      },
    };
  },
};

module.exports = {};

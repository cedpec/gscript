function extractCodeValue(statusArray, codeStr) {
  if (!statusArray || !Array.isArray(statusArray)) return null;
  var found = statusArray.find(function (s) {
    return s && s.code == codeStr;
  });
  return found ? found.value : null;
}

/* Helpers */
function sha256Hex(str) {
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    str,
    Utilities.Charset.UTF_8,
  );
  return bytesToHex(bytes).toLowerCase();
}

function hmacSha256Hex(message, secret) {
  var raw = Utilities.computeHmacSha256Signature(
    message,
    secret,
    Utilities.Charset.UTF_8,
  );
  return bytesToHex(raw);
}

function bytesToHex(bytes) {
  return bytes
    .map(function (b) {
      var v = b < 0 ? b + 256 : b;
      var h = v.toString(16);
      return h.length === 1 ? "0" + h : h;
    })
    .join("");
}

// Si tu veux tester avec Jest
if (typeof module !== "undefined") {
  module.exports = { sha256Hex, hmacSha256Hex, extractCodeValue };
}

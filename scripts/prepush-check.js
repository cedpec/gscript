// Node-only prepush check. If this file is present in Apps Script, do nothing.
if (typeof require !== "function") {
  // Avoid runtime errors in Apps Script where `require` and `process` are not defined
  console.log("prepush-check: skipping (not running in Node).");
} else {
  const fs = require("fs");
  const path = require("path");

  const root = process.cwd();

  function walk(dir, cb) {
    fs.readdirSync(dir).forEach((f) => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        // skip node_modules, .git
        if (["node_modules", ".git"].includes(f)) return;
        walk(full, cb);
      } else {
        cb(full);
      }
    });
  }

  const forbiddenPatterns = [/\bglobal\./, /\bGLOBAL\b/];
  const forbiddenFiles = ["lib/gas-mock.js"];
  let found = [];

  function readClaspIgnore() {
    const igPath = path.join(root, ".claspignore");
    if (!fs.existsSync(igPath)) return [];
    const lines = fs.readFileSync(igPath, "utf8").split(/\r?\n/);
    return lines.map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  }

  const claspIgnores = readClaspIgnore();

  function isIgnoredByClasp(p) {
    if (!p) return false;
    const rel = path.relative(root, p).split(path.sep).join("/");
    for (const pattern of claspIgnores) {
      // handle patterns like 'dir/**' or 'dir/'
      if (pattern.endsWith("/**")) {
        const prefix = pattern.slice(0, -3);
        if (rel === prefix || rel.startsWith(prefix + "/")) return true;
      }
      if (pattern.endsWith("/")) {
        if (
          rel === pattern.slice(0, -1) ||
          rel.startsWith(pattern.slice(0, -1) + "/")
        )
          return true;
      }
      if (pattern === rel) return true;
      if (pattern.startsWith("**/")) {
        const tail = pattern.slice(3);
        if (rel.endsWith(tail)) return true;
      }
      if (pattern.startsWith("*.") && rel.endsWith(pattern.slice(1)))
        return true;
    }
    return false;
  }

  for (const ff of forbiddenFiles) {
    const p = path.join(root, ff);
    if (fs.existsSync(p) && !isIgnoredByClasp(p))
      found.push(`Forbidden file present: ${ff}`);
  }

  walk(root, (file) => {
    if (!file.endsWith(".js") && !file.endsWith(".gs")) return;
    if (file.includes(path.sep + "node_modules" + path.sep)) return;
    if (isIgnoredByClasp(file)) return;
    const content = fs.readFileSync(file, "utf8");
    forbiddenPatterns.forEach((pat) => {
      if (pat.test(content))
        found.push(`Pattern ${pat} found in ${path.relative(root, file)}`);
    });
  });

  if (found.length) {
    console.error(
      "\nPre-push check FAILED: Potentially dangerous files/patterns found:",
    );
    found.forEach((s) => console.error(" - " + s));
    console.error(
      "\nFix the issues or add paths to .claspignore before pushing.",
    );
    process.exit(1);
  } else {
    console.log("Pre-push check passed. No forbidden patterns/files detected.");
    process.exit(0);
  }
}

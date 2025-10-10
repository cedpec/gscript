if (typeof require !== 'function') {
  // Running in Apps Script or another non-Node environment: do nothing
  console.log('install-hooks: skipping (not running in Node).');
} else {
  const fs = require('fs');
  const path = require('path');

  const root = process.cwd();
  const hookSrc = path.join(root, 'scripts', 'prepush-check.js');
  const gitHookDir = path.join(root, '.git', 'hooks');
  const hookDest = path.join(gitHookDir, 'pre-push');

  function install() {
    if (!fs.existsSync(hookSrc)) {
      console.error('Hook source not found:', hookSrc);
      process.exit(1);
    }
    // ensure .git/hooks exists; if not, create it (works even outside a repo)
    fs.mkdirSync(gitHookDir, { recursive: true });
    fs.copyFileSync(hookSrc, hookDest);
    fs.chmodSync(hookDest, 0o755);
    console.log('Pre-push hook installed to', hookDest);
  }

  function uninstall() {
    if (fs.existsSync(hookDest)) {
      fs.unlinkSync(hookDest);
      console.log('Pre-push hook removed from', hookDest);
    } else {
      console.log('No pre-push hook to remove at', hookDest);
    }
  }

  const cmd = process.argv[2] || 'install';
  if (cmd === 'install') install();
  else if (cmd === 'uninstall') uninstall();
  else {
    console.error('Usage: node scripts/install-hooks.js [install|uninstall]');
    process.exit(2);
  }
}

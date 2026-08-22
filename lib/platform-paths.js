'use strict';

const os = require('node:os');
const path = require('node:path');

function resolveCompanionDataDir(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const home = options.home || os.homedir();
  const appName = String(options.appName || 'Desktop Companion').trim()
    || 'Desktop Companion';

  if (env.DESKTOP_COMPANION_DATA_DIR) {
    return path.resolve(env.DESKTOP_COMPANION_DATA_DIR);
  }

  if (platform === 'win32') {
    const appData = env.APPDATA || path.win32.join(home, 'AppData', 'Roaming');
    return path.win32.join(appData, appName);
  }

  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', appName);
  }

  const configRoot = env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(configRoot, appName);
}

module.exports = { resolveCompanionDataDir };

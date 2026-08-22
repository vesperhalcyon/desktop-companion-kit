'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const SEPARATOR = '__VSP__';

const SCRIPT = [
  'set separatorText to "' + SEPARATOR + '"',
  'set appName to ""',
  'set tabTitle to ""',
  'set tabURL to ""',
  'set pageText to ""',
  'tell application "System Events"',
  '  set appName to name of first application process whose frontmost is true',
  'end tell',
  'set jsCode to "document.body ? document.body.innerText.slice(0, 3500).replace(/__VSP__/g, \\" \\") : \\"\\""',
  'if appName is not "Safari" and appName is not "Google Chrome" and appName is not "Google Chrome Canary" and appName is not "Chromium" and appName is not "Brave Browser" and appName is not "Microsoft Edge" and appName is not "Arc" then',
  '  if application "Google Chrome" is running then',
  '    set appName to "Google Chrome"',
  '  else if application "Safari" is running then',
  '    set appName to "Safari"',
  '  else if application "Brave Browser" is running then',
  '    set appName to "Brave Browser"',
  '  else if application "Microsoft Edge" is running then',
  '    set appName to "Microsoft Edge"',
  '  else if application "Arc" is running then',
  '    set appName to "Arc"',
  '  else if application "Chromium" is running then',
  '    set appName to "Chromium"',
  '  end if',
  'end if',
  'if appName is "Safari" then',
  '  tell application "Safari"',
  '    if (count of windows) > 0 then',
  '      set tabTitle to name of current tab of front window',
  '      set tabURL to URL of current tab of front window',
  '      try',
  '        set pageText to do JavaScript jsCode in current tab of front window',
  '      end try',
  '    end if',
  '  end tell',
  'else if appName is "Google Chrome" or appName is "Google Chrome Canary" or appName is "Chromium" or appName is "Brave Browser" or appName is "Microsoft Edge" or appName is "Arc" then',
  '  using terms from application "Google Chrome"',
  '    tell application appName',
  '      if (count of windows) > 0 then',
  '        set tabTitle to title of active tab of front window',
  '        set tabURL to URL of active tab of front window',
  '        try',
  '          set pageText to execute active tab of front window javascript jsCode',
  '        end try',
  '      end if',
  '    end tell',
  '  end using terms from',
  'end if',
  'return appName & separatorText & tabTitle & separatorText & tabURL & separatorText & pageText'
].join('\n');

class PageObserver {
  constructor(options = {}) {
    this.timeout = options.timeout || 8000;
    this.runner = options.runner || runAppleScript;
  }

  async observe() {
    try {
      const output = await this.runner(SCRIPT, this.timeout);
      return normalizeOutput(output);
    } catch (error) {
      const message = String(error.stderr || error.message || error);
      return {
        ok: false,
        app: '',
        title: '',
        url: '',
        text: '',
        error: message,
        permissionHint: /not authorized|not allowed|assistive|automation|-1743/i.test(message)
      };
    }
  }
}

async function runAppleScript(script, timeout) {
  const result = await execFileAsync('/usr/bin/osascript', ['-e', script], {
    timeout,
    maxBuffer: 1024 * 1024,
    encoding: 'utf8'
  });
  return result.stdout;
}

function normalizeOutput(raw) {
  const parts = String(raw || '').trimEnd().split(SEPARATOR);
  const app = parts.shift() || '';
  const title = parts.shift() || '';
  const url = parts.shift() || '';
  const text = cleanPageText(parts.join(SEPARATOR));

  return {
    ok: Boolean(url),
    app: app.trim(),
    title: title.trim(),
    url: url.trim(),
    text,
    error: '',
    permissionHint: false
  };
}

function cleanPageText(value) {
  return String(value || '')
    .replace(/\0/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3500);
}

module.exports = {
  PageObserver,
  normalizeOutput,
  cleanPageText,
  SCRIPT,
  SEPARATOR
};

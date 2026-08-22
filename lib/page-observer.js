'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const SEPARATOR = '__VSP__';

const APPLE_SCRIPT = [
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

const WINDOWS_SCRIPT = [
  'Add-Type -TypeDefinition @\'',
  'using System;',
  'using System.Runtime.InteropServices;',
  'public static class DesktopCompanionForeground {',
  '  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
  '  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);',
  '}',
  '\'@',
  '$browserNames = @("chrome", "msedge", "brave", "firefox", "opera")',
  '$selected = $null',
  '$handle = [DesktopCompanionForeground]::GetForegroundWindow()',
  '[uint32]$processIdValue = 0',
  '[void][DesktopCompanionForeground]::GetWindowThreadProcessId($handle, [ref]$processIdValue)',
  'if ($processIdValue -gt 0) {',
  '  $foreground = Get-Process -Id $processIdValue -ErrorAction SilentlyContinue',
  '  if ($null -ne $foreground) {',
  '    $foregroundName = $foreground.ProcessName.ToLowerInvariant()',
  '    if ($browserNames -contains $foregroundName -and $foreground.MainWindowTitle) {',
  '      $selected = $foreground',
  '    }',
  '  }',
  '}',
  'if ($null -eq $selected) {',
  '  $selected = Get-Process -ErrorAction SilentlyContinue |',
  '    Where-Object {',
  '      $_.MainWindowTitle -and $browserNames -contains $_.ProcessName.ToLowerInvariant()',
  '    } |',
  '    Sort-Object StartTime -Descending |',
  '    Select-Object -First 1',
  '}',
  'if ($null -eq $selected) {',
  '  @{ app = ""; title = "" } | ConvertTo-Json -Compress',
  '} else {',
  '  @{ app = $selected.ProcessName; title = $selected.MainWindowTitle } | ConvertTo-Json -Compress',
  '}'
].join('\n');

const WINDOWS_APP_NAMES = Object.freeze({
  chrome: 'Google Chrome',
  msedge: 'Microsoft Edge',
  brave: 'Brave Browser',
  firefox: 'Firefox',
  opera: 'Opera'
});

class PageObserver {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.timeout = options.timeout || 8000;
    this.runner = options.runner || runnerForPlatform(this.platform);
  }

  get capability() {
    if (this.platform === 'darwin') return 'content';
    if (this.platform === 'win32') return 'title';
    return 'unsupported';
  }

  async observe() {
    if (!this.runner) {
      return unavailableResult(
        this.platform,
        'Page sight is not implemented on this operating system.'
      );
    }

    try {
      const script = this.platform === 'win32' ? WINDOWS_SCRIPT : APPLE_SCRIPT;
      const output = await this.runner(script, this.timeout);
      return this.platform === 'win32'
        ? normalizeWindowsOutput(output)
        : normalizeAppleOutput(output);
    } catch (error) {
      const message = String(error.stderr || error.message || error);
      return {
        ...unavailableResult(this.platform, message),
        permissionHint: this.platform === 'darwin'
          && /not authorized|not allowed|assistive|automation|-1743/i.test(message)
      };
    }
  }
}

function runnerForPlatform(platform) {
  if (platform === 'darwin') return runAppleScript;
  if (platform === 'win32') return runPowerShell;
  return null;
}

async function runAppleScript(script, timeout) {
  const result = await execFileAsync('/usr/bin/osascript', ['-e', script], {
    timeout,
    maxBuffer: 1024 * 1024,
    encoding: 'utf8'
  });
  return result.stdout;
}

async function runPowerShell(script, timeout) {
  const result = await execFileAsync('powershell.exe', [
    '-NoLogo',
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-Command',
    script
  ], {
    timeout,
    maxBuffer: 1024 * 1024,
    encoding: 'utf8',
    windowsHide: true
  });
  return result.stdout;
}

function normalizeAppleOutput(raw) {
  const parts = String(raw || '').trimEnd().split(SEPARATOR);
  const app = parts.shift() || '';
  const title = parts.shift() || '';
  const url = parts.shift() || '';
  const text = cleanPageText(parts.join(SEPARATOR));

  return {
    ok: Boolean(url),
    platform: 'darwin',
    capability: 'content',
    app: app.trim(),
    title: title.trim(),
    url: url.trim(),
    text,
    error: '',
    permissionHint: false
  };
}

function normalizeWindowsOutput(raw) {
  const parsed = JSON.parse(String(raw || '').replace(/^\uFEFF/, '').trim() || '{}');
  const processName = String(parsed.app || '').toLowerCase();
  const app = WINDOWS_APP_NAMES[processName] || String(parsed.app || '').trim();
  const title = cleanPageText(parsed.title || '').slice(0, 500);
  return {
    ok: Boolean(app && title),
    platform: 'win32',
    capability: 'title',
    app,
    title,
    url: '',
    text: '',
    error: app && title ? '' : 'No supported browser window was found.',
    permissionHint: false
  };
}

function unavailableResult(platform, error) {
  return {
    ok: false,
    platform,
    capability: 'unsupported',
    app: '',
    title: '',
    url: '',
    text: '',
    error,
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
  normalizeOutput: normalizeAppleOutput,
  normalizeAppleOutput,
  normalizeWindowsOutput,
  cleanPageText,
  APPLE_SCRIPT,
  WINDOWS_SCRIPT,
  SCRIPT: APPLE_SCRIPT,
  SEPARATOR,
  WINDOWS_APP_NAMES
};

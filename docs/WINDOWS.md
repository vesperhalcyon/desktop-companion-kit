# Windows setup

Desktop Companion Kit supports Windows 10/11 on x64.

## Run from source

Install current Node.js LTS and Git, then use PowerShell:

```powershell
git clone https://github.com/vesperhalcyon/desktop-companion-kit.git
Set-Location desktop-companion-kit
npm install
npm start
```

The transparent companion window, dragging, wandering, gestures, typed chat, local inbox, always-on-top behavior, and open-at-login setting work on Windows.

## Build the Windows app

```powershell
npm run package:windows
```

The unpacked application is written under:

```text
.artifacts/Desktop Companion-win32-x64/
```

The current project does not code-sign releases. Windows SmartScreen may warn about a locally packaged executable. Inspect and build from source when provenance matters.

## Page sight on Windows

Page sight remains off by default. When enabled, the Windows adapter uses local PowerShell and Win32 APIs to find a visible Chrome, Edge, Brave, Firefox, or Opera window.

The Windows capability is deliberately **title-only**:

- it can identify the browser and visible window title;
- it does not read the URL or page body;
- it does not use a browser extension, remote-debugging port, or network service;
- it never sends the observed title to the optional model bridge.

A host project may add a richer, explicitly installed browser adapter. Keep that adapter opt-in and preserve the local-only boundary unless the user separately consents to transmission.

## Scheduled speech

The default inbox is:

```text
%APPDATA%\Desktop Companion\inbox.jsonl
```

Write a line from PowerShell:

```powershell
npm run say -- "A short line for the desktop."
```

Task Scheduler can invoke `node.exe` with `scripts\say.js` and the desired line. Set `DESKTOP_COMPANION_DATA_DIR` when the scheduler and app need an explicit shared directory.

## Optional model bridge

The model bridge is disabled by default. On Windows, configure `config/model-bridge.local.json` with a real executable such as `node.exe` plus the path to a JavaScript CLI. Avoid `.cmd` or `.bat` wrappers: the bridge intentionally uses direct process execution rather than a command shell.

Never commit the local bridge file or credentials.

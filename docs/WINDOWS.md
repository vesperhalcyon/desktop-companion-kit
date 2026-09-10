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

## Watch With Me on Windows

Watch With Me is off by default and is a stronger opt-in than Page sight — it records eight seconds of the active streaming window and sends that clip to the vision model. On Windows it uses **ffmpeg's `gdigrab`** to record only the browser window whose title names Netflix or Hulu; there is no whole-desktop fallback and no screenshot fallback.

### 1. Install ffmpeg (required)

ffmpeg is the window recorder. Without it, Watch With Me honestly reports that it cannot see rather than downgrading to a still image.

```powershell
winget install Gyan.FFmpeg
# then restart the terminal so ffmpeg is on PATH, and confirm:
ffmpeg -version
```

If ffmpeg is installed somewhere off PATH, point the app at it — either set an environment variable:

```powershell
$env:DESKTOP_COMPANION_FFMPEG = "C:\tools\ffmpeg\bin\ffmpeg.exe"
```

or create `config/watch.local.json` (git-ignored):

```json
{ "ffmpegPath": "C:\\tools\\ffmpeg\\bin\\ffmpeg.exe" }
```

### 2. Enable the vision + model bridges

Watch With Me shares the same bridges as macOS. Copy `config/vision-bridge.json` to `config/vision-bridge.local.json`, enable it, and point it at `scripts/minimax-video-eye.js`; the vision bridge accepts native video only. The factual description then goes to the DeepSeek Flash text bridge (`config/model-bridge.local.json`) for a short in-character reaction.

### 3. Use it

Bring a playing **Netflix** or **Hulu** window to the front so the service name shows in its window title, then choose **Watch with me** from the controls.

### Windows-specific notes

- **Title, not URL.** Windows page sight is title-only, so service detection keys off the window title. Keep the streaming site's name in the tab/window title (the default browser behavior).
- **Keep the window visible.** `gdigrab` records the window as composited; a minimized window produces an empty clip, which is reported as a capture failure.
- **DRM.** Protected playback can capture as a black frame on Windows just as on macOS. The companion says it cannot see rather than inventing a reaction.
- **Same privacy boundary as macOS.** One window, ~8 seconds, deleted immediately after every attempt. No whole-desktop capture, no keyframe or screenshot fallback.

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

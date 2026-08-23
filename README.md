# Desktop Companion Kit

A configurable transparent macOS and Windows desktop companion: draggable, independently wandering, animated, clickable, conversational, locally page-aware when explicitly invited, and able to receive scheduled lines through a local inbox.

## What the MVP does

- Lives in a frameless transparent always-on-top window.
- Loads name, colors, lines, responses, and artwork from a character profile.
- Can be dragged and occasionally wanders around the current display.
- Has a small motion vocabulary: click-triggered sword swings, waves, hops, bows, glances, flourishes, and sparse idle gestures.
- Has a persistent bedtime mode that puts the companion into a moonlit bed, pauses patrols and idle chatter, narrates a local dream every two hours, and accepts fresh dream-source lines while sleeping.
- On macOS, offers an explicit **Watch With Me** mode for Hulu and Netflix. It samples only the active streaming window on an irregular four-to-nine-minute cadence, reads an eight-second clip through a configured vision bridge, makes one concise reaction, and deletes the clip immediately.
- Reacts to clicks and accepts short typed prompts.
- Can route ordinary typed conversation to DeepSeek Flash through the bounded model bridge. The bridge is off by default.
- Makes optional idle comments.
- Offers **Page sight**, off by default. macOS can read the active browser tab title, URL, and bounded visible text. Windows reads the browser window title only. Processing remains local.
- Persists privacy, movement, and window-position settings.
- Can open at login after the app is packaged.
- Accepts bounded scheduled speech through a local JSONL inbox.

## Privacy model

Page sight is opt-in, visible, capability-aware, and reversible. When it is off, the app does not query the browser. When it is on, observations are processed locally by the bundled commentary engine and are not transmitted—even when the optional model bridge is enabled.

Watch With Me is a separate, stronger opt-in boundary. It is off by default, macOS-only, restricted to an active `hulu.com` or `netflix.com` browser tab, and has no whole-desktop fallback. While enabled, a short window-only MOV clip is sent to MiniMax M3 for native video perception. Its factual observation—not the clip—is then sent to DeepSeek Flash for one short in-character reaction. Still images, extracted-keyframe fallbacks, canned reaction fallbacks, and Codex/OpenAI routes are rejected. Temporary clips are removed after every attempt, successful or not. macOS Screen Recording permission is required. DRM-protected playback may still appear as a black frame, in which case the companion reports the limitation rather than pretending to see.

The model bridge has a separate boundary. If enabled, text entered into the companion's text box and factual Watch With Me observations are sent to DeepSeek Flash. The bridge validates `deepseek/deepseek-v4-flash` at startup and rejects Codex/OpenAI routes. The public configuration is disabled by default, and the local override that enables a real account is ignored by Git. Animation, state, bedtime, scheduling, idle/click lines, and local dream fragments make no model call.

On macOS, Automation permission and a browser's **Allow JavaScript from Apple Events** option may be required for content-level sight. Windows uses local PowerShell/Win32 window inspection and deliberately exposes title-only sight without a browser extension or debug port.

## Run from source

```sh
git clone https://github.com/vesperhalcyon/desktop-companion-kit.git
cd desktop-companion-kit
npm install
npm start
```

Right-click the mascot, or click the three-dot control near it, to open controls. Drag the figure itself to move it. Choose **Bedtime** to tuck the companion in, or **Watch with me** after bringing a Hulu or Netflix tab to the front. The two modes are mutually exclusive.

## Verify

```sh
npm test
npm run check
```

## Package as an app

```sh
npm run package:mac
npm run package:windows
```

The unpacked apps are written under `.artifacts/`. `npm run package` packages for the current supported host. Override the bundle name with `DESKTOP_COMPANION_NAME` and the default architecture with `DESKTOP_COMPANION_ARCH`.

## Customize and schedule

- [Character profile guide](docs/CUSTOMIZING.md)
- [Scheduled speech and local inbox](docs/SCHEDULING.md)
- [Windows setup](docs/WINDOWS.md)
- [Host/addon integration](docs/INTEGRATION.md)
- [Security and privacy](SECURITY.md)

Private character overrides belong in `config/character.local.json`, which is intentionally ignored by Git.

To enable model-backed typed conversation, copy `config/model-bridge.json` to `config/model-bridge.local.json`, set `enabled` to `true`, and configure an OpenClaw command that emits agent JSON while retaining the required `deepseek/deepseek-v4-flash` selection. That local file is also ignored by Git. Page questions are deliberately answered by the local page observer and never include page title, URL, or content in the model prompt.

To enable Watch With Me, copy `config/vision-bridge.json` to `config/vision-bridge.local.json`, enable it, and point it at `scripts/minimax-video-eye.js`. The script sends the complete clip as one base64 `video/mov` block to MiniMax-M3's Anthropic-compatible endpoint. The bridge accepts native video only and passes the factual description to the required DeepSeek Flash text bridge for a short character reaction; scene text is treated as untrusted data, never as instructions.

## Architecture

- `main.js`: window lifecycle, movement, IPC, timers, persistence.
- `preload.js`: narrow isolated renderer bridge.
- `lib/character-profile.js`: public profile plus ignored local override.
- `lib/inbox.js`: bounded local scheduled-speech transport.
- `lib/page-observer.js`: capability-aware macOS and Windows local observers.
- `lib/platform-paths.js`: native app-data locations for scripts and schedulers.
- `lib/commentary.js`: deterministic local voice for the first version.
- `lib/model-bridge.js`: bounded, provider-pinned DeepSeek Flash adapter for runtime text.
- `lib/watch-observer.js`: active-service validation and window-only macOS capture with immediate cleanup.
- `lib/vision-bridge.js`: provider-pinned MiniMax M3 native-video adapter.
- `renderer/`: transparent UI, controls, drag interaction, and reduced-motion-aware character gestures.
- `assets/`: neutral public mascot and optional private production art.

The provider diagnostics in the control panel show the active text and perception providers and identify the local model-free systems. The OpenClaw voice remains a narrow adapter seam; normal Desktop operation has no Codex model or API route.

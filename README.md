# Desktop Companion Kit

A configurable transparent macOS desktop companion: draggable, independently wandering, clickable, conversational, able to observe the active browser tab when explicitly invited, and able to receive scheduled lines through a local inbox.

## What the MVP does

- Lives in a frameless transparent always-on-top window.
- Loads name, colors, lines, responses, and artwork from a character profile.
- Can be dragged and occasionally wanders around the current display.
- Reacts to clicks and accepts short typed prompts.
- Makes optional idle comments.
- Offers **Page sight**, off by default. When enabled, it asks macOS Automation for the active browser tab title, URL, and up to 3,500 characters of visible text. Processing is local.
- Persists privacy, movement, and window-position settings.
- Can open at login after the app is packaged.
- Accepts bounded scheduled speech through a local JSONL inbox.

## Privacy model

Page sight is opt-in, visible, and reversible. When it is off, the app does not ask the browser or System Events for page information. When it is on, page content is processed locally by the bundled commentary engine and is not transmitted.

macOS may request Automation permission for the companion to access System Events and the active browser. Some browsers also require their **Allow JavaScript from Apple Events** developer option before visible page text is available. Without it, the app falls back to title and URL.

## Run from source

```sh
npm install
npm start
```

Right-click the mascot, or click the three-dot control near it, to open controls. Drag the figure itself to move it.

## Verify

```sh
npm test
npm run check
```

## Package as an app

```sh
npm run package
```

The packaged app is written under `.artifacts/`. Override the bundle name with `DESKTOP_COMPANION_NAME`.

## Customize and schedule

- [Character profile guide](docs/CUSTOMIZING.md)
- [Scheduled speech and local inbox](docs/SCHEDULING.md)
- [Security and privacy](SECURITY.md)

Private character overrides belong in `config/character.local.json`, which is intentionally ignored by Git.

## Architecture

- `main.js`: window lifecycle, movement, IPC, timers, persistence.
- `preload.js`: narrow isolated renderer bridge.
- `lib/character-profile.js`: public profile plus ignored local override.
- `lib/inbox.js`: bounded local scheduled-speech transport.
- `lib/page-observer.js`: local macOS Automation adapter.
- `lib/commentary.js`: deterministic local voice for the first version.
- `renderer/`: transparent UI, controls, drag interaction.
- `assets/`: neutral public mascot and optional private production art.

The live OpenClaw voice is intentionally a separate adapter seam. The MVP does not weaken agent isolation or silently send viewed page content into another session.

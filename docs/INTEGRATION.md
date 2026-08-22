# Host and addon integration

Desktop Companion Kit keeps its reusable surfaces narrow so a host such as Recoria Hearth can adopt it without inheriting a private character or model stack.

## Stable seams

### Character profile

`config/character.json` defines public defaults. A host can generate or install `config/character.local.json` for a private character. The local file remains ignored by Git.

### Character asset

Put a transparent PNG or SVG under `assets/` and reference its basename from the profile. Private artwork should use an ignored `*.private.*` filename unless distribution rights are explicit.

### Scheduled speech

`scripts/say.js` writes bounded JSONL entries to the native app-data directory. A host scheduler can call the script or implement the same local inbox contract:

```json
{"text":"A short line.","createdAt":"2026-01-01T12:00:00.000Z","source":"scheduled"}
```

### Optional model voice

`config/model-bridge.json` is disabled by default. The bridge invokes a configured executable directly and expects JSON containing:

```json
{"result":{"payloads":[{"text":"The reply."}]}}
```

Only text deliberately entered into the companion's chat box is passed to this adapter. Page sight context is never included.

### Page sight

The bundled observer exposes a capability with each result:

- `content` on macOS: title, URL, and bounded visible text;
- `title` on Windows: browser and visible window title;
- `unsupported` elsewhere.

Host-specific browser integrations should preserve this capability contract and the visible opt-in toggle.

## Recommended addon boundary

A host addon should own:

1. character selection and private art installation;
2. model/provider configuration and credentials;
3. any scheduler or autonomous-line policy;
4. platform packaging and signing;
5. explicit consent for every data path that leaves the machine.

The kit should continue to own:

1. the transparent window and motion system;
2. safe renderer isolation;
3. bounded profiles, inbox entries, and replies;
4. platform capability reporting;
5. local Page sight defaults and privacy floor.

That division lets a host replace personality and orchestration without forking the desktop physics.

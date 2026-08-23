# Scheduled speech

The app watches a local inbox.

- macOS: `~/Library/Application Support/<character name>/inbox.jsonl`
- Windows: `%APPDATA%\<character name>\inbox.jsonl`

Write a line with:

```sh
npm run say -- "A short line for the desktop."
```

For a differently named public character, set `DESKTOP_COMPANION_APP_NAME` to the exact profile name. `DESKTOP_COMPANION_DATA_DIR` can override the directory directly.

Each entry is JSONL with bounded text, a timestamp, and a source label. The app polls locally, ignores malformed or stale entries, and shows each recent line once.

## Dream lines

Bedtime mode pauses wandering, idle comments, and ordinary scheduled lines. Entries whose source is exactly `dream` are shown only while bedtime mode is active:

```sh
DESKTOP_COMPANION_SOURCE=dream npm run say -- "The road bent through violet fog, and I knew where it ended."
```

This makes the sleeping renderer the gate: a scheduler may run on a fixed cadence, but dream fragments do not surface while the companion is awake. Likewise, ordinary hourly lines do not wake the sleeping scene.

Bedtime mode is persistent across restarts and can be changed from the control panel, the context menu, or typed commands such as `time for bed` and `wake up`.

The app also carries a zero-network fallback: while bedtime mode remains active, it narrates one line from the profile's `dreamLines` every two hours. A scheduler may add fresh dream-source lines, but the sleeping animation does not depend on a model or gateway being available.

Any scheduler can call the script: launchd/cron on macOS or Task Scheduler on Windows. If an LLM generates lines, keep model access separate from Page sight: the bundled app never sends page observations to the scheduler.

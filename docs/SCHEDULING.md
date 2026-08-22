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

Any scheduler can call the script: launchd/cron on macOS or Task Scheduler on Windows. If an LLM generates lines, keep model access separate from Page sight: the bundled app never sends page observations to the scheduler.

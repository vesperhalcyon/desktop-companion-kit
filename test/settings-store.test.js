'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { SettingsStore, sanitize } = require('../lib/settings-store');

test('sanitize rejects malformed positions and unknown keys', () => {
  const clean = sanitize({
    wander: 1,
    idleComments: 0,
    observePages: true,
    alwaysOnTop: false,
    launchAtLogin: true,
    windowPosition: { x: 'bad', y: 4 },
    surprise: 'no'
  });

  assert.deepEqual(clean, {
    wander: true,
    idleComments: false,
    observePages: true,
    alwaysOnTop: false,
    launchAtLogin: true,
    windowPosition: null
  });
});

test('settings persist atomically and reload', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-vesper-'));
  const file = path.join(dir, 'settings.json');
  const store = new SettingsStore(file);
  store.load();
  store.update({ wander: false, windowPosition: { x: 12.4, y: 20.6 } });

  const reloaded = new SettingsStore(file);
  assert.deepEqual(reloaded.load().windowPosition, { x: 12, y: 21 });
  assert.equal(reloaded.get().wander, false);
});

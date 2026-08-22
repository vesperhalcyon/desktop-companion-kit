'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = Object.freeze({
  wander: true,
  idleComments: true,
  observePages: false,
  alwaysOnTop: true,
  launchAtLogin: false,
  windowPosition: null
});

class SettingsStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.value = { ...DEFAULTS };
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      this.value = sanitize({ ...DEFAULTS, ...parsed });
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn('[settings] using defaults:', error.message);
      }
      this.value = { ...DEFAULTS };
    }
    return this.get();
  }

  get() {
    return JSON.parse(JSON.stringify(this.value));
  }

  update(patch) {
    this.value = sanitize({ ...this.value, ...patch });
    this.save();
    return this.get();
  }

  save() {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const tempPath = this.filePath + '.tmp';
    fs.writeFileSync(tempPath, JSON.stringify(this.value, null, 2) + '\n', {
      encoding: 'utf8',
      mode: 0o600
    });
    fs.renameSync(tempPath, this.filePath);
  }
}

function sanitize(input) {
  const clean = {
    wander: Boolean(input.wander),
    idleComments: Boolean(input.idleComments),
    observePages: Boolean(input.observePages),
    alwaysOnTop: input.alwaysOnTop !== false,
    launchAtLogin: Boolean(input.launchAtLogin),
    windowPosition: null
  };

  if (
    input.windowPosition &&
    Number.isFinite(input.windowPosition.x) &&
    Number.isFinite(input.windowPosition.y)
  ) {
    clean.windowPosition = {
      x: Math.round(input.windowPosition.x),
      y: Math.round(input.windowPosition.y)
    };
  }

  return clean;
}

module.exports = { SettingsStore, DEFAULTS, sanitize };

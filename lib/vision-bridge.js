'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  command: 'node',
  args: [],
  timeoutMs: 120000,
  maxDescriptionChars: 5000
});

class VisionBridge {
  constructor(config, options = {}) {
    this.config = sanitizeConfig(config);
    this.runner = options.runner || runCommand;
  }

  get enabled() {
    return this.config.enabled;
  }

  async describe(mediaPath, context) {
    if (!this.enabled) return '';
    const resolved = path.resolve(String(mediaPath || ''));
    if (!fs.existsSync(resolved)) throw new Error('Vision media does not exist');
    const cleanContext = String(context || '')
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 600);
    const args = [
      ...this.config.args,
      ...(cleanContext ? ['--context', cleanContext] : []),
      resolved
    ];
    const { stdout } = await this.runner(this.config.command, args, this.config.timeoutMs);
    return extractDescription(stdout).slice(0, this.config.maxDescriptionChars);
  }
}

function loadVisionBridgeConfig(rootDir) {
  return sanitizeConfig({
    ...DEFAULT_CONFIG,
    ...readJson(path.join(rootDir, 'config', 'vision-bridge.json')),
    ...readJson(path.join(rootDir, 'config', 'vision-bridge.local.json'))
  });
}

function sanitizeConfig(input = {}) {
  return {
    enabled: Boolean(input.enabled),
    command: String(input.command || DEFAULT_CONFIG.command).slice(0, 1000),
    args: Array.isArray(input.args)
      ? input.args.map((value) => String(value).slice(0, 1000)).slice(0, 30)
      : [...DEFAULT_CONFIG.args],
    timeoutMs: clampNumber(input.timeoutMs, 10000, 180000, DEFAULT_CONFIG.timeoutMs),
    maxDescriptionChars: clampNumber(
      input.maxDescriptionChars,
      500,
      10000,
      DEFAULT_CONFIG.maxDescriptionChars
    )
  };
}

function extractDescription(value) {
  const text = String(value || '').replace(/\r/g, '').trim();
  if (!text) throw new Error('Vision bridge returned no description');
  const marker = text.match(/(?:VIDEO|DESCRIPTION|TRANSCRIPTION)[^:]*:\s*\n?([\s\S]+)$/i);
  return String(marker ? marker[1] : text)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[vision-bridge] ignored invalid config:', filePath, error.message);
    }
    return {};
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

async function runCommand(command, args, timeoutMs) {
  return execFileAsync(command, args, {
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
    encoding: 'utf8',
    env: process.env
  });
}

module.exports = {
  DEFAULT_CONFIG,
  VisionBridge,
  loadVisionBridgeConfig,
  sanitizeConfig,
  extractDescription
};

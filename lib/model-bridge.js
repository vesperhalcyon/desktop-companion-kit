'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  command: 'openclaw',
  args: ['agent', '--json'],
  timeoutMs: 60000,
  maxReplyChars: 600
});

class ModelBridge {
  constructor(config, options = {}) {
    this.config = sanitizeConfig(config);
    this.runner = options.runner || runCommand;
  }

  get enabled() {
    return this.config.enabled;
  }

  async ask(message) {
    if (!this.enabled) return '';
    const cleanMessage = cleanUserMessage(message);
    if (!cleanMessage) return '';

    const prompt = [
      'DESKTOP COMPANION — INTERACTIVE WINDOW.',
      'Reply directly to the person using the desktop companion, in the configured character voice.',
      'Do not call tools, send messages, recap instructions, or mention this wrapper.',
      'Keep the answer to one or two concise sentences suitable for a desktop speech bubble.',
      'The page itself is not included; page content remains local to the desktop app.',
      '',
      'THE PERSON WROTE:',
      cleanMessage
    ].join('\n');

    const { stdout } = await this.runner(
      this.config.command,
      [...this.config.args, '--message', prompt],
      this.config.timeoutMs
    );
    return extractReply(stdout).slice(0, this.config.maxReplyChars);
  }
}

function loadModelBridgeConfig(rootDir) {
  const publicPath = path.join(rootDir, 'config', 'model-bridge.json');
  const localPath = path.join(rootDir, 'config', 'model-bridge.local.json');
  return sanitizeConfig({
    ...DEFAULT_CONFIG,
    ...readJson(publicPath),
    ...readJson(localPath)
  });
}

function sanitizeConfig(input = {}) {
  const args = Array.isArray(input.args)
    ? input.args.map((value) => String(value).slice(0, 1000)).slice(0, 40)
    : [...DEFAULT_CONFIG.args];
  return {
    enabled: Boolean(input.enabled),
    command: String(input.command || DEFAULT_CONFIG.command).slice(0, 1000),
    args,
    timeoutMs: clampNumber(input.timeoutMs, 5000, 120000, DEFAULT_CONFIG.timeoutMs),
    maxReplyChars: clampNumber(input.maxReplyChars, 80, 1200, DEFAULT_CONFIG.maxReplyChars)
  };
}

function extractReply(raw) {
  const parsed = JSON.parse(String(raw || '').trim());
  const payloads = parsed && parsed.result && parsed.result.payloads;
  const text = Array.isArray(payloads)
    ? payloads.map((payload) => payload && payload.text).find(Boolean)
    : '';
  if (!text) throw new Error('Model bridge returned no text payload');
  return String(text).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanUserMessage(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, 1000);
}

async function runCommand(command, args, timeoutMs) {
  return execFileAsync(command, args, {
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
    encoding: 'utf8',
    env: process.env
  });
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[model-bridge] ignored invalid config:', filePath, error.message);
    }
    return {};
  }
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

module.exports = {
  DEFAULT_CONFIG,
  ModelBridge,
  loadModelBridgeConfig,
  sanitizeConfig,
  extractReply,
  cleanUserMessage
};

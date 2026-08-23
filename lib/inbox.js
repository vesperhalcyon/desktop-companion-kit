'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_LINE_LENGTH = 500;
const RECENT_WINDOW_MS = 10 * 60 * 1000;

class InboxReader {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.cursor = 0;
    this.recentWindowMs = options.recentWindowMs || RECENT_WINDOW_MS;
  }

  poll(now = Date.now()) {
    return this.pollEntries(now).map((entry) => entry.text);
  }

  pollEntries(now = Date.now()) {
    let content;
    try {
      content = fs.readFileSync(this.filePath, 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }

    if (this.cursor > content.length) this.cursor = 0;
    const unread = content.slice(this.cursor);
    this.cursor = content.length;
    if (!unread) return [];

    return unread
      .split('\n')
      .filter(Boolean)
      .map(parseLine)
      .filter(Boolean)
      .filter((entry) => now - entry.createdAt <= this.recentWindowMs);
  }
}

function writeInboxMessage(filePath, text, options = {}) {
  const clean = cleanMessage(text);
  if (!clean) throw new Error('Desktop companion message cannot be empty.');

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const entry = {
    text: clean,
    createdAt: options.createdAt || Date.now(),
    source: cleanSource(options.source || 'external')
  };
  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n', {
    encoding: 'utf8',
    mode: 0o600
  });
  return entry;
}

function parseLine(line) {
  try {
    const parsed = JSON.parse(line);
    const text = cleanMessage(parsed.text);
    const createdAt = Number(parsed.createdAt);
    if (!text || !Number.isFinite(createdAt)) return null;
    return {
      text,
      createdAt,
      source: cleanSource(parsed.source)
    };
  } catch {
    return null;
  }
}

function cleanMessage(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LINE_LENGTH);
}

function cleanSource(value) {
  return String(value || 'external').replace(/[^a-z0-9_-]/gi, '').slice(0, 40) || 'external';
}

module.exports = {
  InboxReader,
  writeInboxMessage,
  parseLine,
  cleanMessage,
  MAX_LINE_LENGTH,
  RECENT_WINDOW_MS
};

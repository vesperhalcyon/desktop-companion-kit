#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { loadCharacterProfile } = require('../lib/character-profile');
const { writeInboxMessage } = require('../lib/inbox');
const { resolveCompanionDataDir } = require('../lib/platform-paths');

const text = process.argv.slice(2).join(' ').trim();
const character = loadCharacterProfile(path.join(__dirname, '..'));
if (!text) {
  process.stderr.write('Usage: node scripts/say.js "A short desktop-companion line."\n');
  process.exitCode = 2;
} else {
  const dataDir = resolveCompanionDataDir({
    appName: process.env.DESKTOP_COMPANION_APP_NAME || character.name
  });
  const inboxPath = path.join(dataDir, 'inbox.jsonl');
  const entry = writeInboxMessage(inboxPath, text, {
    source: process.env.DESKTOP_COMPANION_SOURCE || 'scheduled'
  });
  process.stdout.write(JSON.stringify({
    ok: true,
    inboxPath,
    createdAt: entry.createdAt,
    length: entry.text.length
  }) + '\n');
}

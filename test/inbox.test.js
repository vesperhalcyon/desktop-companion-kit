'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  InboxReader,
  writeInboxMessage,
  parseLine,
  cleanMessage
} = require('../lib/inbox');

test('writer and reader deliver new recent messages exactly once', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-inbox-'));
  const inboxPath = path.join(directory, 'inbox.jsonl');
  const now = Date.now();
  const reader = new InboxReader(inboxPath);

  writeInboxMessage(inboxPath, '  There   you are.  ', { createdAt: now });
  assert.deepEqual(reader.poll(now), ['There you are.']);
  assert.deepEqual(reader.poll(now), []);
});

test('reader ignores stale and malformed entries', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-inbox-'));
  const inboxPath = path.join(directory, 'inbox.jsonl');
  const now = Date.now();
  const reader = new InboxReader(inboxPath, { recentWindowMs: 1000 });

  fs.writeFileSync(inboxPath, [
    'not json',
    JSON.stringify({ text: 'too old', createdAt: now - 2000 }),
    JSON.stringify({ text: 'current', createdAt: now })
  ].join('\n') + '\n');

  assert.deepEqual(reader.poll(now), ['current']);
  assert.equal(parseLine('{}'), null);
  assert.equal(cleanMessage('a\n\tb'), 'a b');
});

'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const test = require('node:test');

const scriptPath = path.join(__dirname, '..', 'scripts', 'say.js');

test('say CLI writes a parseable inbox entry and prints a receipt', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'desktop-say-'));
  const output = execFileSync(process.execPath, [scriptPath, 'A live line.'], {
    encoding: 'utf8',
    env: { ...process.env, DESKTOP_COMPANION_DATA_DIR: dataDir }
  });
  const receipt = JSON.parse(output);
  const entry = JSON.parse(fs.readFileSync(path.join(dataDir, 'inbox.jsonl'), 'utf8').trim());

  assert.equal(receipt.ok, true);
  assert.equal(receipt.length, 12);
  assert.equal(entry.text, 'A live line.');
});

test('say CLI rejects an empty message', () => {
  const result = spawnSync(process.execPath, [scriptPath], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
});

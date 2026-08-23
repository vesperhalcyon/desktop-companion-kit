'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { VisionBridge, extractDescription } = require('../lib/vision-bridge');

test('vision bridge passes context and media as distinct execFile arguments', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vision-bridge-')), 'clip.mov');
  fs.writeFileSync(file, Buffer.alloc(32));
  let observed = null;
  const bridge = new VisionBridge({
    enabled: true,
    command: '/usr/bin/node',
    args: ['/private/see.js', '--m3']
  }, {
    runner: async (command, args, timeoutMs) => {
      observed = { command, args, timeoutMs };
      return { stdout: 'VIDEO (MiniMax-M3):\nA person opens a red door.' };
    }
  });
  assert.equal(await bridge.describe(file, 'Hulu; do not spoil'), 'A person opens a red door.');
  assert.equal(observed.command, '/usr/bin/node');
  assert.deepEqual(observed.args.slice(-3), ['--context', 'Hulu; do not spoil', file]);
});

test('description extraction strips the eye wrapper and control characters', () => {
  assert.equal(
    extractDescription('DESCRIPTION (MiniMax-M3):\nA\u0000 quiet shot.\nThen a cut.'),
    'A quiet shot. Then a cut.'
  );
});

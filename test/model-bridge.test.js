'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ModelBridge,
  sanitizeConfig,
  extractReply
} = require('../lib/model-bridge');

test('model bridge appends a bounded user message and extracts gateway JSON', async () => {
  let observed = null;
  const bridge = new ModelBridge({
    enabled: true,
    command: '/usr/bin/example',
    args: ['agent', '--json'],
    timeoutMs: 9000,
    maxReplyChars: 120
  }, {
    runner: async (command, args, timeoutMs) => {
      observed = { command, args, timeoutMs };
      return {
        stdout: JSON.stringify({
          result: { payloads: [{ text: '  A real reply.\nStill one line.  ' }] }
        })
      };
    }
  });

  const reply = await bridge.ask('Can you hear me?');
  assert.equal(reply, 'A real reply. Still one line.');
  assert.equal(observed.command, '/usr/bin/example');
  assert.equal(observed.timeoutMs, 9000);
  assert.equal(observed.args.at(-2), '--message');
  assert.match(observed.args.at(-1), /THE PERSON WROTE:\nCan you hear me\?/);
});

test('disabled bridge makes no model call', async () => {
  const bridge = new ModelBridge({ enabled: false }, {
    runner: async () => assert.fail('runner should not be called')
  });
  assert.equal(await bridge.ask('hello'), '');
});

test('config bounds timeouts and malformed gateway output fails visibly', () => {
  const config = sanitizeConfig({ enabled: true, timeoutMs: 1, maxReplyChars: 99999 });
  assert.equal(config.timeoutMs, 5000);
  assert.equal(config.maxReplyChars, 1200);
  assert.throws(() => extractReply('{}'), /no text payload/);
});

'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  ENDPOINT,
  buildRequest,
  parseArguments,
  requestNativeVideo
} = require('../scripts/minimax-video-eye');

test('native M3 request carries the complete MOV in one video block', () => {
  const body = buildRequest(Buffer.from('complete-mov'), 'Netflix scene');
  assert.equal(body.model, 'MiniMax-M3');
  assert.equal(body.messages[0].content[0].type, 'video');
  assert.deepEqual(body.messages[0].content[0].source, {
    type: 'base64',
    media_type: 'video/mov',
    data: Buffer.from('complete-mov').toString('base64')
  });
  assert.equal(body.messages[0].content.filter((block) => block.type === 'image').length, 0);
  assert.match(body.messages[0].content[1].text, /across time/);
});

test('native M3 client uses the Anthropic-compatible endpoint and extracts text', async () => {
  let observed;
  const result = await requestNativeVideo(Buffer.from('mov'), 'Hulu', {
    key: 'test-key',
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return {
        ok: true,
        json: async () => ({ content: [{ type: 'text', text: 'A door opens, then closes.' }] })
      };
    }
  });
  assert.equal(result, 'A door opens, then closes.');
  assert.equal(observed.url, ENDPOINT);
  assert.equal(observed.options.headers['x-api-key'], 'test-key');
  assert.equal(JSON.parse(observed.options.body).messages[0].content[0].type, 'video');
});

test('keyframe fallback is rejected', () => {
  assert.deepEqual(parseArguments(['--context', 'scene', '/tmp/clip.mov']), {
    context: 'scene', mediaPath: '/tmp/clip.mov'
  });
  assert.throws(
    () => parseArguments(['--fallback-keyframes', '/tmp/clip.mov']),
    /requires native video perception/
  );
});

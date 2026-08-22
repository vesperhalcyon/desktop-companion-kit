'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PageObserver,
  normalizeOutput,
  cleanPageText,
  SEPARATOR
} = require('../lib/page-observer');

test('normalizeOutput parses app, title, URL, and text', () => {
  const raw = [
    'Safari',
    'Example',
    'https://example.com',
    'Hello\nworld'
  ].join(SEPARATOR);
  assert.deepEqual(normalizeOutput(raw), {
    ok: true,
    app: 'Safari',
    title: 'Example',
    url: 'https://example.com',
    text: 'Hello world',
    error: '',
    permissionHint: false
  });
});

test('cleanPageText collapses and bounds visible content', () => {
  const value = cleanPageText(('hello\n\tworld '.repeat(500)));
  assert.ok(value.length <= 3500);
  assert.doesNotMatch(value, /\n|\t/);
});

test('observer converts permission failures into a visible hint', async () => {
  const observer = new PageObserver({
    runner: async () => {
      const error = new Error('Not authorized to send Apple events');
      error.stderr = 'execution error: Not authorized (-1743)';
      throw error;
    }
  });
  const result = await observer.observe();
  assert.equal(result.ok, false);
  assert.equal(result.permissionHint, true);
});

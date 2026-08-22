'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PageObserver,
  normalizeOutput,
  normalizeWindowsOutput,
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
    platform: 'darwin',
    capability: 'content',
    app: 'Safari',
    title: 'Example',
    url: 'https://example.com',
    text: 'Hello world',
    error: '',
    permissionHint: false
  });
});

test('Windows output reports honest title-only browser sight', () => {
  assert.deepEqual(normalizeWindowsOutput(JSON.stringify({
    app: 'msedge',
    title: 'A useful page - Microsoft Edge'
  })), {
    ok: true,
    platform: 'win32',
    capability: 'title',
    app: 'Microsoft Edge',
    title: 'A useful page - Microsoft Edge',
    url: '',
    text: '',
    error: '',
    permissionHint: false
  });
});

test('Windows observer selects the PowerShell contract', async () => {
  let script = '';
  const observer = new PageObserver({
    platform: 'win32',
    runner: async (received) => {
      script = received;
      return JSON.stringify({ app: 'chrome', title: 'Example' });
    }
  });
  const result = await observer.observe();
  assert.match(script, /DesktopCompanionForeground/);
  assert.equal(observer.capability, 'title');
  assert.equal(result.app, 'Google Chrome');
  assert.equal(result.ok, true);
});

test('cleanPageText collapses and bounds visible content', () => {
  const value = cleanPageText(('hello\n\tworld '.repeat(500)));
  assert.ok(value.length <= 3500);
  assert.doesNotMatch(value, /\n|\t/);
});

test('observer converts permission failures into a visible hint', async () => {
  const observer = new PageObserver({
    platform: 'darwin',
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

test('unsupported platforms fail closed without invoking a runner', async () => {
  const observer = new PageObserver({ platform: 'freebsd' });
  const result = await observer.observe();
  assert.equal(observer.capability, 'unsupported');
  assert.equal(result.ok, false);
  assert.match(result.error, /not implemented/);
});

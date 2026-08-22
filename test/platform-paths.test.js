'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const { resolveCompanionDataDir } = require('../lib/platform-paths');

test('data directory follows native macOS and Windows conventions', () => {
  assert.equal(
    resolveCompanionDataDir({
      platform: 'darwin',
      home: '/Users/example',
      env: {},
      appName: 'Small Friend'
    }),
    path.join('/Users/example', 'Library', 'Application Support', 'Small Friend')
  );
  assert.equal(
    resolveCompanionDataDir({
      platform: 'win32',
      home: 'C:\\Users\\example',
      env: { APPDATA: 'C:\\Users\\example\\AppData\\Roaming' },
      appName: 'Small Friend'
    }),
    path.win32.join('C:\\Users\\example\\AppData\\Roaming', 'Small Friend')
  );
});

test('explicit data directory override wins on every platform', () => {
  assert.equal(
    resolveCompanionDataDir({
      platform: 'win32',
      env: { DESKTOP_COMPANION_DATA_DIR: '/tmp/companion-data' },
      appName: 'Ignored'
    }),
    path.resolve('/tmp/companion-data')
  );
});

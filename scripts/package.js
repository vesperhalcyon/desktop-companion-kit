#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { packager } = require('@electron/packager');

const target = process.argv[2] || process.platform;
const supported = {
  darwin: { platform: 'darwin', arch: process.env.DESKTOP_COMPANION_ARCH || 'arm64' },
  win32: { platform: 'win32', arch: process.env.DESKTOP_COMPANION_ARCH || 'x64' }
};

if (!supported[target]) {
  process.stderr.write('Usage: node scripts/package.js darwin|win32\n');
  process.exitCode = 2;
} else {
  const root = path.join(__dirname, '..');
  const name = process.env.DESKTOP_COMPANION_NAME || 'Desktop Companion';
  packager({
    dir: root,
    name,
    ...supported[target],
    out: path.join(root, '.artifacts'),
    overwrite: true,
    asar: true
  }).then((paths) => {
    process.stdout.write(JSON.stringify({
      ok: true,
      target,
      paths
    }) + '\n');
  }).catch((error) => {
    process.stderr.write(error.stack + '\n');
    process.exitCode = 1;
  });
}

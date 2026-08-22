'use strict';

const { PageObserver } = require('../lib/page-observer');

new PageObserver().observe().then((result) => {
  const safeResult = {
    ...result,
    text: result.text ? result.text.slice(0, 240) : ''
  };
  process.stdout.write(JSON.stringify(safeResult, null, 2) + '\n');
  const expectedWindowsEmpty = result.platform === 'win32'
    && result.error === 'No supported browser window was found.';
  if (!result.ok && result.error && !result.permissionHint && !expectedWindowsEmpty) {
    process.exitCode = 1;
  }
});

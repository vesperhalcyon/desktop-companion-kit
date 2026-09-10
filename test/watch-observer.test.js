'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  WatchObserver,
  serviceForUrl,
  serviceForTitle,
  selectSource,
  windowIdFromSource
} = require('../lib/watch-observer');

test('stream services are host-bounded and window ids are parsed narrowly', () => {
  assert.equal(serviceForUrl('https://www.netflix.com/watch/123').name, 'Netflix');
  assert.equal(serviceForUrl('https://evil.example/?next=netflix.com'), null);
  assert.equal(windowIdFromSource('window:456:0'), '456');
  assert.equal(windowIdFromSource('screen:456:0'), '');
});

test('source selection prefers the active streaming title', () => {
  const sources = [
    { id: 'window:1:0', name: 'Email - Work' },
    { id: 'window:2:0', name: 'The Diplomat | Netflix' }
  ];
  const chosen = selectSource(
    sources,
    { title: 'The Diplomat | Netflix' },
    { name: 'Netflix' }
  );
  assert.equal(chosen.id, 'window:2:0');
});

test('observer records a window-only clip and returns its bounded context', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-observer-'));
  let observedArgs = null;
  const observer = new WatchObserver({
    platform: 'darwin',
    tempRoot: dir,
    clipSeconds: 3,
    pageObserver: {
      observe: async () => ({
        ok: true,
        title: 'Only Murders in the Building | Hulu',
        url: 'https://www.hulu.com/watch/example'
      })
    },
    desktopCapturer: {
      getSources: async (options) => {
        assert.deepEqual(options.types, ['window']);
        return [{
          id: 'window:987:0',
          name: 'Only Murders in the Building | Hulu',
          thumbnail: { toPNG: () => Buffer.alloc(2048, 1) }
        }];
      }
    },
    runner: async (_command, args) => {
      observedArgs = args;
      fs.writeFileSync(args.at(-1), Buffer.alloc(5000, 2));
    }
  });

  const result = await observer.capture();
  assert.equal(result.ok, true);
  assert.equal(result.mediaType, 'video');
  assert.equal(result.service, 'Hulu');
  assert.ok(observedArgs.includes('-l987'));
  assert.ok(observedArgs.includes('-V3'));
  assert.equal(fs.statSync(result.mediaPath).mode & 0o777, 0o600);
  observer.cleanup(result);
  assert.equal(fs.existsSync(result.mediaPath), false);
});

test('observer refuses to capture non-streaming tabs', async () => {
  const observer = new WatchObserver({
    platform: 'darwin',
    pageObserver: {
      observe: async () => ({ ok: true, title: 'Bank', url: 'https://bank.example/' })
    },
    desktopCapturer: {
      getSources: async () => assert.fail('desktop capture must not run')
    }
  });
  const result = await observer.capture();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'no-stream');
});

test('windows detects the streaming service from the window title (no url)', () => {
  assert.equal(serviceForTitle('The Diplomat - Netflix - Google Chrome').name, 'Netflix');
  assert.equal(serviceForTitle('Only Murders in the Building - Hulu').name, 'Hulu');
  assert.equal(serviceForTitle('Inbox (12) - Gmail'), null);
  assert.equal(serviceForTitle(''), null);
});

test('windows is supported with only a page observer (no desktopCapturer)', () => {
  const observer = new WatchObserver({
    platform: 'win32',
    pageObserver: { observe: async () => ({}) }
  });
  assert.equal(observer.supported, true);
});

test('windows records a title-targeted gdigrab clip and returns video', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'watch-observer-win-'));
  let observedCommand = null;
  let observedArgs = null;
  const observer = new WatchObserver({
    platform: 'win32',
    tempRoot: dir,
    clipSeconds: 4,
    ffmpegPath: 'C:/tools/ffmpeg.exe',
    pageObserver: {
      observe: async () => ({
        ok: true,
        title: 'The Diplomat - Netflix - Google Chrome',
        url: ''
      })
    },
    runner: async (command, args) => {
      observedCommand = command;
      observedArgs = args;
      fs.writeFileSync(args.at(-1), Buffer.alloc(6000, 3));
    }
  });

  const result = await observer.capture();
  assert.equal(result.ok, true);
  assert.equal(result.mediaType, 'video');
  assert.equal(result.service, 'Netflix');
  assert.equal(observedCommand, 'C:/tools/ffmpeg.exe');
  assert.ok(observedArgs.includes('gdigrab'));
  assert.ok(observedArgs.includes('title=The Diplomat - Netflix - Google Chrome'));
  observer.cleanup(result);
  assert.equal(fs.existsSync(result.mediaPath), false);
});

test('windows reports a clear message when ffmpeg is missing', async () => {
  const observer = new WatchObserver({
    platform: 'win32',
    pageObserver: {
      observe: async () => ({ ok: true, title: 'Show - Hulu', url: '' })
    },
    runner: async () => {
      const error = new Error('spawn ffmpeg ENOENT');
      error.code = 'ENOENT';
      throw error;
    }
  });
  const result = await observer.capture();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ffmpeg-missing');
  assert.match(result.error, /needs ffmpeg/i);
});

test('windows refuses non-streaming windows', async () => {
  const observer = new WatchObserver({
    platform: 'win32',
    pageObserver: {
      observe: async () => ({ ok: true, title: 'Inbox - Gmail', url: '' })
    },
    runner: async () => assert.fail('recorder must not run for a non-streaming window')
  });
  const result = await observer.capture();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'no-stream');
});

test('observer reports a precise screen permission failure', async () => {
  const observer = new WatchObserver({
    platform: 'darwin',
    pageObserver: {
      observe: async () => ({
        ok: true,
        title: 'Example | Netflix',
        url: 'https://www.netflix.com/watch/example'
      })
    },
    desktopCapturer: {
      getSources: async () => { throw new Error('Failed to get sources.'); }
    }
  });
  const result = await observer.capture();
  assert.equal(result.ok, false);
  assert.equal(result.code, 'screen-permission');
  assert.match(result.error, /Screen Recording permission/);
});

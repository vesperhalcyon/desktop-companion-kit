#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { app, desktopCapturer } = require('electron');

const { WatchObserver } = require('../lib/watch-observer');

const execFileAsync = promisify(execFile);
const needle = String(process.argv[2] || 'Desktop Vesper').toLowerCase();

app.whenReady().then(async () => {
  let result = null;
  let stage = 'list-sources';
  let exitCode = 0;
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1280, height: 720 },
      fetchWindowIcons: false
    });
    const target = sources.find((source) => source.name.toLowerCase().includes(needle));
    if (!target) throw new Error('The requested probe window is not available');
    stage = 'capture-window';
    const observer = new WatchObserver({
      platform: 'darwin',
      desktopCapturer: { getSources: async () => [target] },
      pageObserver: {
        observe: async () => ({
          ok: true,
          title: target.name,
          url: 'https://www.netflix.com/watch/probe'
        })
      },
      clipSeconds: 2,
      tempRoot: path.join(process.cwd(), '.artifacts', 'watch-probe')
    });
    result = await observer.capture();
    if (!result.ok) throw new Error(result.code + ': ' + result.error);
    stage = 'verify-media';
    let duration = null;
    if (result.mediaType === 'video') {
      const probe = await execFileAsync('/opt/homebrew/bin/ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        result.mediaPath
      ], { encoding: 'utf8', timeout: 10000 });
      duration = Number.parseFloat(probe.stdout.trim());
      if (!Number.isFinite(duration) || duration < 1) {
        throw new Error('Captured video has no usable duration');
      }
    }
    process.stdout.write(JSON.stringify({
      ok: true,
      sourceMatched: true,
      mediaType: result.mediaType,
      bytes: fs.statSync(result.mediaPath).size,
      duration
    }) + '\n');
    observer.cleanup(result);
  } catch (error) {
    if (result && result.mediaPath) {
      try { fs.rmSync(result.mediaPath, { force: true }); } catch {}
    }
    const detail = String(error && (error.stack || error.message) || error || 'unknown error')
      .replace(/\s+/g, ' ')
      .trim();
    process.stderr.write('[watch-probe:' + stage + '] ' + detail + '\n');
    exitCode = 1;
  } finally {
    app.exit(exitCode);
  }
});

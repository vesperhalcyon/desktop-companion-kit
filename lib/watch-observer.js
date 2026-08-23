'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const STREAM_SERVICES = Object.freeze([
  { name: 'Netflix', hosts: ['netflix.com'] },
  { name: 'Hulu', hosts: ['hulu.com'] }
]);

class WatchObserver {
  constructor(options = {}) {
    this.platform = options.platform || process.platform;
    this.desktopCapturer = options.desktopCapturer;
    this.pageObserver = options.pageObserver;
    this.clipSeconds = clampNumber(options.clipSeconds, 2, 20, 8);
    this.runner = options.runner || runCaptureCommand;
    this.tempRoot = options.tempRoot || path.join(os.tmpdir(), 'desktop-companion-watch');
  }

  get supported() {
    return this.platform === 'darwin' && Boolean(this.desktopCapturer && this.pageObserver);
  }

  async capture() {
    if (!this.supported) {
      return failure('unsupported', 'Watch With Me is currently available on macOS only.');
    }

    const page = await this.pageObserver.observe();
    const service = serviceForUrl(page.url);
    if (!page.ok || !service) {
      return failure(
        'no-stream',
        'Bring a playing Hulu or Netflix tab to the front, then try Watch With Me again.',
        page
      );
    }

    let sources = [];
    try {
      sources = await this.desktopCapturer.getSources({
        types: ['window'],
        thumbnailSize: { width: 1280, height: 720 },
        fetchWindowIcons: false
      });
    } catch (error) {
      return failure(
        'screen-permission',
        'Screen Recording permission is closed. Open it in the controls, allow this app, then restart me.',
        page,
        service.name
      );
    }
    const source = selectSource(sources, page, service);
    if (!source) {
      return failure(
        'no-window',
        'I found the streaming tab, but macOS did not expose its window for capture.',
        page,
        service.name
      );
    }

    fs.mkdirSync(this.tempRoot, { recursive: true, mode: 0o700 });
    const stem = 'watch-' + process.pid + '-' + Date.now();
    const windowId = windowIdFromSource(source.id);
    if (windowId) {
      const clipPath = path.join(this.tempRoot, stem + '.mov');
      try {
        await this.runner('/usr/sbin/screencapture', [
          '-x',
          '-v',
          '-V' + this.clipSeconds,
          '-l' + windowId,
          clipPath
        ], (this.clipSeconds + 12) * 1000);
        if (isUsableFile(clipPath, 4096)) {
          fs.chmodSync(clipPath, 0o600);
          return success(clipPath, 'video', page, service.name, source.name);
        }
        safeRemove(clipPath);
      } catch (error) {
        safeRemove(clipPath);
      }
    }

    const imagePath = path.join(this.tempRoot, stem + '.png');
    try {
      const png = source.thumbnail && source.thumbnail.toPNG();
      if (!png || png.length < 1024) {
        return failure(
          'permission-or-drm',
          'The streaming window is hidden from capture. Check Screen Recording permission; protected video may also appear black.',
          page,
          service.name
        );
      }
      fs.writeFileSync(imagePath, png, { mode: 0o600 });
      return success(imagePath, 'still', page, service.name, source.name);
    } catch (error) {
      safeRemove(imagePath);
      return failure(
        'capture-failed',
        'I could not capture the streaming window: ' + cleanError(error),
        page,
        service.name
      );
    }
  }

  cleanup(result) {
    if (result && result.mediaPath) safeRemove(result.mediaPath);
  }
}

function serviceForUrl(value) {
  try {
    const host = new URL(String(value || '')).hostname.toLowerCase();
    return STREAM_SERVICES.find((service) =>
      service.hosts.some((domain) => host === domain || host.endsWith('.' + domain))
    ) || null;
  } catch {
    return null;
  }
}

function selectSource(sources, page, service) {
  const title = normalize(page && page.title);
  const serviceName = normalize(service && service.name);
  const ranked = (Array.isArray(sources) ? sources : [])
    .filter((source) => String(source && source.id || '').startsWith('window:'))
    .map((source) => ({ source, score: scoreSource(normalize(source.name), title, serviceName) }))
    .sort((a, b) => b.score - a.score);
  return ranked[0] && ranked[0].score >= 30 ? ranked[0].source : null;
}

function scoreSource(name, title, serviceName) {
  if (!name) return 0;
  let score = 0;
  if (title && name === title) score += 120;
  else if (title && (name.includes(title) || title.includes(name))) score += 85;
  if (serviceName && name.includes(serviceName)) score += 45;
  const titleTokens = new Set(title.split(' ').filter((token) => token.length > 3));
  const overlap = name.split(' ').filter((token) => titleTokens.has(token)).length;
  score += Math.min(40, overlap * 10);
  return score;
}

function windowIdFromSource(value) {
  const match = String(value || '').match(/^window:(\d+):/);
  return match ? match[1] : '';
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function success(mediaPath, mediaType, page, service, sourceName) {
  return {
    ok: true,
    mediaPath,
    mediaType,
    page,
    service,
    sourceName: String(sourceName || '').slice(0, 300),
    error: '',
    code: ''
  };
}

function failure(code, error, page = null, service = '') {
  return { ok: false, mediaPath: '', mediaType: '', page, service, sourceName: '', error, code };
}

function isUsableFile(filePath, minimumBytes) {
  try {
    return fs.statSync(filePath).size >= minimumBytes;
  } catch {
    return false;
  }
}

function safeRemove(filePath) {
  try { fs.rmSync(filePath, { force: true }); } catch {}
}

function cleanError(error) {
  return String(error && (error.stderr || error.message) || error || 'unknown error')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

async function runCaptureCommand(command, args, timeoutMs) {
  return execFileAsync(command, args, {
    timeout: timeoutMs,
    maxBuffer: 1024 * 1024,
    encoding: 'utf8'
  });
}

module.exports = {
  WatchObserver,
  STREAM_SERVICES,
  serviceForUrl,
  selectSource,
  windowIdFromSource,
  scoreSource
};

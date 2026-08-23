'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  Menu,
  screen,
  shell,
  systemPreferences
} = require('electron');

const { SettingsStore } = require('./lib/settings-store');
const { loadCharacterProfile } = require('./lib/character-profile');
const { InboxReader } = require('./lib/inbox');
const { PageObserver } = require('./lib/page-observer');
const { ModelBridge, loadModelBridgeConfig } = require('./lib/model-bridge');
const { VisionBridge, loadVisionBridgeConfig } = require('./lib/vision-bridge');
const { WatchObserver } = require('./lib/watch-observer');
const {
  idleLines,
  clickLines,
  pick,
  pageComment,
  replyToUser,
  isPageIntent
} = require('./lib/commentary');

const WINDOW_WIDTH = 330;
const WINDOW_HEIGHT = 430;
const WANDER_MIN_MS = 18000;
const WANDER_MAX_MS = 42000;
const IDLE_COMMENT_MS = 36000;
const DREAM_COMMENT_MS = process.env.DESKTOP_COMPANION_SMOKE === '1'
  ? 700
  : 2 * 60 * 60 * 1000;
const WATCH_MIN_MS = process.env.DESKTOP_COMPANION_SMOKE === '1'
  ? 700
  : 4 * 60 * 1000;
const WATCH_MAX_MS = process.env.DESKTOP_COMPANION_SMOKE === '1'
  ? 1000
  : 9 * 60 * 1000;

let petWindow = null;
let store = null;
let observer = null;
let modelBridge = null;
let visionBridge = null;
let watchObserver = null;
let character = loadCharacterProfile(__dirname);
let inboxReader = null;
let pageContext = null;
let panelOpen = false;
let isDragging = false;
let isMoving = false;
let wanderTimer = null;
let idleTimer = null;
let inboxTimer = null;
let dreamTimer = null;
let watchTimer = null;
let persistTimer = null;
let watchInFlight = false;
let watchFailureCode = '';
let recentWatchLines = [];

app.setName(character.name);

app.whenReady().then(() => {
  const settingsPath = process.env.DESKTOP_COMPANION_SMOKE === '1'
    ? path.join(process.cwd(), '.artifacts', 'smoke-settings-' + process.pid + '.json')
    : path.join(app.getPath('userData'), 'settings.json');
  store = new SettingsStore(settingsPath);
  store.load();
  inboxReader = new InboxReader(path.join(path.dirname(settingsPath), 'inbox.jsonl'));
  observer = new PageObserver({ platform: process.platform });
  const bridgeConfig = loadModelBridgeConfig(__dirname);
  if (process.env.DESKTOP_COMPANION_SMOKE === '1'
      && process.env.DESKTOP_COMPANION_SMOKE_MODEL !== '1') {
    bridgeConfig.enabled = false;
  }
  modelBridge = new ModelBridge(bridgeConfig);
  const visionConfig = loadVisionBridgeConfig(__dirname);
  if (process.env.DESKTOP_COMPANION_SMOKE === '1'
      && process.env.DESKTOP_COMPANION_SMOKE_VISION !== '1') {
    visionConfig.enabled = false;
  }
  visionBridge = new VisionBridge(visionConfig);
  watchObserver = new WatchObserver({
    platform: process.platform,
    desktopCapturer,
    pageObserver: { observe: () => observePage() },
    clipSeconds: process.env.DESKTOP_COMPANION_SMOKE === '1' ? 2 : 8
  });

  if (process.platform === 'darwin' && app.dock) app.dock.hide();

  createWindow();
  registerIpc();
  applyLoginSetting(store.get().launchAtLogin);
  scheduleWander();
  scheduleIdleComments();
  scheduleInbox();
  scheduleDreams();
  scheduleWatch();
});

app.on('window-all-closed', () => app.quit());

function createWindow() {
  const settings = store.get();
  const bounds = initialBounds(settings.windowPosition);

  petWindow = new BrowserWindow({
    ...bounds,
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: settings.alwaysOnTop,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  });

  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  installSmokeCapture();
  petWindow.once('ready-to-show', () => petWindow.showInactive());
  petWindow.on('moved', persistPosition);
  petWindow.on('closed', () => {
    petWindow = null;
    clearTimeout(wanderTimer);
    clearInterval(idleTimer);
    clearInterval(inboxTimer);
    clearTimeout(dreamTimer);
    clearTimeout(watchTimer);
  });
}

function installSmokeCapture() {
  if (process.env.DESKTOP_COMPANION_SMOKE !== '1') return;

  petWindow.webContents.once('did-finish-load', async () => {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const modelSmoke = process.env.DESKTOP_COMPANION_SMOKE_MODEL === '1';
    const pageSmoke = process.env.DESKTOP_COMPANION_SMOKE_PAGE === '1';
    if (pageSmoke) store.update({ observePages: true });
    const gestureProbe = await petWindow.webContents.executeJavaScript(`
      document.getElementById('avatarWrap').dispatchEvent(new CustomEvent(
        'companion:gesture-test',
        { detail: 'sword' }
      ));
      ({
        gesture: document.getElementById('avatarWrap').dataset.gesture || '',
        animationName: getComputedStyle(document.getElementById('avatar')).animationName,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
      })
    `);
    const smokeMessage = modelSmoke
      ? 'Reply with exactly this marker and nothing else: DEEPSEEK_DESKTOP_OK'
      : pageSmoke
        ? 'Can you see the page?'
        : 'smoke interaction line';
    await petWindow.webContents.executeJavaScript(`
      document.getElementById('settingsButton').click();
      document.getElementById('askInput').value = ${JSON.stringify(smokeMessage)};
      document.getElementById('askInput').dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true
      }));
    `);
    const attempts = modelSmoke ? 60 : 10;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const complete = await petWindow.webContents.executeJavaScript(`
        document.getElementById('panel').hidden
          && !document.getElementById('speech').hidden
          && Boolean(document.getElementById('speechText').textContent.trim())
      `);
      if (complete) break;
      await new Promise((resolve) => setTimeout(resolve, modelSmoke ? 1000 : 100));
    }
    const ui = await petWindow.webContents.executeJavaScript(`
      ({
        title: document.title,
        avatarLoaded: document.getElementById('avatar').complete,
        avatarWidth: document.getElementById('avatar').naturalWidth,
        speech: document.getElementById('speechText').textContent,
        panelHidden: document.getElementById('panel').hidden,
        speechHidden: document.getElementById('speech').hidden,
        pageSightChecked: document.getElementById('observePages').checked
      })
    `);
    let pageProbe = null;
    if (process.env.DESKTOP_COMPANION_SMOKE_PAGE === '1') {
      const context = await observePage();
      pageProbe = {
        ok: context.ok,
        platform: context.platform,
        capability: context.capability,
        app: context.app,
        hasText: Boolean(context.text),
        textLength: context.text.length,
        permissionHint: context.permissionHint
      };
      if (!pageProbe.ok || pageProbe.capability !== 'content' || !pageProbe.hasText) {
        throw new Error('Page sight did not read visible browser content');
      }
    }
    await petWindow.webContents.executeJavaScript(`
      document.getElementById('settingsButton').click();
      document.getElementById('watchButton').click();
    `);
    await new Promise((resolve) => setTimeout(resolve, 180));
    const watchProbe = await petWindow.webContents.executeJavaScript(`
      (() => {
        const wrap = document.getElementById('avatarWrap');
        const scene = document.querySelector('.watchScene');
        const foreground = document.querySelector('.watchForeground');
        const seat = document.querySelector('.watchSeat');
        const avatar = document.getElementById('watchAvatar');
        const wrapRect = wrap.getBoundingClientRect();
        const seatRect = seat.getBoundingClientRect();
        return ({
          watching: wrap.classList.contains('watching'),
          sleeping: wrap.classList.contains('sleeping'),
          sceneVisibility: getComputedStyle(scene).visibility,
          foregroundVisibility: getComputedStyle(foreground).visibility,
          avatarClipPath: getComputedStyle(document.querySelector('.avatarStage')).clipPath,
          avatarAnimation: getComputedStyle(document.getElementById('watchAvatar')).animationName,
          buttonPressed: document.getElementById('watchButton').getAttribute('aria-pressed'),
          seatHeight: seatRect.height,
          seatTopRatio: (seatRect.top - wrapRect.top) / wrapRect.height,
          armHeight: Number.parseFloat(getComputedStyle(seat, '::before').height),
          avatarTop: Number.parseFloat(getComputedStyle(avatar).top),
          watchSrc: avatar.currentSrc || avatar.src,
          watchDisplay: getComputedStyle(avatar).display,
          standingDisplay: getComputedStyle(document.getElementById('avatar')).display,
          watchRect: (() => { const rect = avatar.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }; })()
        });
      })()
    `);
    if (!watchProbe.watching || watchProbe.sleeping
        || watchProbe.sceneVisibility !== 'visible'
        || watchProbe.foregroundVisibility !== 'visible'
        || watchProbe.buttonPressed !== 'true'
        || watchProbe.seatHeight > 36
        || watchProbe.seatTopRatio < 0.9
        || watchProbe.armHeight > 34
        || watchProbe.avatarTop < 20
        || watchProbe.avatarTop > 32) {
      throw new Error('Watch With Me did not enter its visible exclusive state');
    }
    const watchImage = await petWindow.capturePage();
    await petWindow.webContents.executeJavaScript(`
      document.getElementById('settingsButton').click();
      document.getElementById('watchButton').click();
    `);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await petWindow.webContents.executeJavaScript(`
      document.getElementById('settingsButton').click();
      document.getElementById('bedtimeButton').click();
    `);
    await new Promise((resolve) => setTimeout(resolve, 1450));
    const sleepProbe = await petWindow.webContents.executeJavaScript(`
      (() => {
        const avatarStyle = getComputedStyle(document.getElementById('avatar'));
        const avatarStageStyle = getComputedStyle(document.querySelector('.avatarStage'));
        const backdropStyle = getComputedStyle(document.querySelector('.sleepScene'));
        const foregroundStyle = getComputedStyle(document.querySelector('.sleepForeground'));
        return ({
        sleeping: document.getElementById('avatarWrap').classList.contains('sleeping'),
        bedVisibility: backdropStyle.visibility,
        foregroundVisibility: foregroundStyle.visibility,
        backdropZ: Number(backdropStyle.zIndex),
        avatarZ: Number(avatarStageStyle.zIndex),
        foregroundZ: Number(foregroundStyle.zIndex),
        avatarClipPath: avatarStageStyle.clipPath,
        avatarAnimation: avatarStyle.animationName,
        speechKind: document.getElementById('speech').dataset.kind || '',
        dreamText: document.getElementById('speechText').textContent,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
        });
      })()
    `);
    if (!sleepProbe.sleeping || sleepProbe.bedVisibility !== 'visible') {
      throw new Error('Bedtime mode did not reveal the sleeping scene');
    }
    if (sleepProbe.foregroundVisibility !== 'visible'
        || !(sleepProbe.backdropZ < sleepProbe.avatarZ
          && sleepProbe.avatarZ < sleepProbe.foregroundZ)
        || sleepProbe.avatarClipPath === 'none') {
      throw new Error('Bedtime mode did not layer and crop the sleeping pose correctly');
    }
    if (sleepProbe.speechKind !== 'dream' || !character.dreamLines.includes(sleepProbe.dreamText)) {
      throw new Error('Bedtime mode did not narrate a local dream');
    }
    if (!sleepProbe.reducedMotion && !sleepProbe.avatarAnimation.includes('settleIntoBed')) {
      throw new Error('Bedtime mode did not start the tuck-in animation');
    }
    const image = await petWindow.capturePage();
    if (!ui.panelHidden || ui.speechHidden || !ui.speech.trim()) {
      throw new Error('Typed interaction did not produce a visible reply');
    }
    if (!gestureProbe.reducedMotion
        && (gestureProbe.gesture !== 'sword'
          || gestureProbe.animationName !== 'swordStance')) {
      throw new Error('Gesture interaction did not start a visible animation');
    }
    if (modelSmoke && !ui.speech.includes('DEEPSEEK_DESKTOP_OK')) {
      throw new Error('Model-backed interaction did not return the expected marker');
    }
    if (pageSmoke && !/^Yes\. I can see/.test(ui.speech)) {
      throw new Error('Page-aware interaction did not report visible page content');
    }
    const artifactDir = path.join(process.cwd(), '.artifacts');
    const imagePath = path.join(artifactDir, 'desktop-vesper-smoke.png');
    const watchImagePath = path.join(artifactDir, 'desktop-vesper-watch-smoke.png');
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(imagePath, image.toPNG());
    fs.writeFileSync(watchImagePath, watchImage.toPNG());
    process.stdout.write('[smoke] ' + JSON.stringify({
      ...ui,
      gestureProbe,
      watchProbe,
      watchImagePath,
      sleepProbe,
      imagePath,
      pageProbe
    }) + '\n');
    app.quit();
  });
}

function initialBounds(saved) {
  if (saved) return { x: saved.x, y: saved.y };

  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  return {
    x: area.x + area.width - WINDOW_WIDTH - 28,
    y: area.y + area.height - WINDOW_HEIGHT - 18
  };
}

function registerIpc() {
  ipcMain.handle('pet:get-state', () => ({
    settings: store.get(),
    character,
    pageContext,
    version: app.getVersion(),
    platform: process.platform,
    pageCapability: observer.capability,
    modelEnabled: modelBridge.enabled,
    runtimeProviders: {
      text: modelBridge.diagnostics,
      watchPerception: visionBridge.diagnostics,
      localSystems: {
        provider: 'local',
        model: null,
        features: ['animation', 'state', 'bedtime', 'scheduling', 'dream-fragments']
      }
    },
    watchCapability: {
      supported: watchObserver.supported,
      visionEnabled: visionBridge.enabled,
      screenPermission: process.platform === 'darwin'
        ? systemPreferences.getMediaAccessStatus('screen')
        : 'unknown',
      services: ['Hulu', 'Netflix']
    }
  }));

  ipcMain.handle('pet:react', () => {
    if (store.get().bedtimeMode) {
      const line = 'Mm. Still here, little Keeper. Just dreaming.';
      sendComment(line, 'dream');
      return line;
    }
    if (store.get().watchMode) {
      const line = 'I am watching. The tiny commentary tribunal is in session.';
      sendComment(line, 'watch');
      return line;
    }

    const line = pageContext && store.get().observePages && Math.random() > 0.55
      ? pageComment(pageContext)
      : pick(character.clickLines || clickLines);
    sendComment(line, 'click');
    return line;
  });

  ipcMain.handle('pet:ask', async (_event, message) => {
    const text = String(message || '');
    const pageIntent = isPageIntent(text);
    const bedtimeCommand = /\b(bedtime|go to bed|sleep now|time for bed|good ?night)\b/i.test(text);
    const wakeCommand = /\b(wake up|awake|good morning|rise and shine)\b/i.test(text);
    const watchCommand = /\b(watch with me|movie mode|watch mode|watch this)\b/i.test(text);
    const stopWatchCommand = /\b(stop watching|leave movie mode|end watch mode)\b/i.test(text);
    const localCommand = /move|wander|walk|other side|quiet|hush|shh|stop talking/i
      .test(text);
    let context = pageContext;
    if (pageIntent && store.get().observePages) {
      context = await observePage();
    }

    let line = '';
    if (pageIntent || localCommand || bedtimeCommand || wakeCommand || watchCommand
        || stopWatchCommand || !modelBridge.enabled) {
      line = replyToUser(text, context, character);
    } else {
      try {
        line = await modelBridge.ask(text);
      } catch (error) {
        console.warn('[model-bridge] reply failed:', error.message);
        line = 'I heard you, but DeepSeek did not answer the little window. Try me once more.';
      }
    }

    if (/move|wander|walk|other side/i.test(text)) {
      setTimeout(() => wanderNow(true), 350);
    }

    if (/quiet|hush|shh|stop talking/i.test(text)) {
      store.update({ idleComments: false });
    }

    if (bedtimeCommand || wakeCommand || watchCommand || stopWatchCommand) {
      const before = store.get();
      const next = store.update({
        bedtimeMode: bedtimeCommand,
        watchMode: watchCommand
      });
      syncModes(before, next, watchCommand);
    }

    return { line, settings: store.get(), pageContext: context };
  });

  ipcMain.handle('pet:observe-now', async () => {
    if (!store.get().observePages) {
      return {
        context: null,
        line: 'Page sight is off. Turn it on first; I do not peer through closed doors.'
      };
    }
    const context = await observePage();
    const line = pageComment(context);
    sendComment(line, 'page');
    return { context, line };
  });

  ipcMain.handle('pet:update-settings', (_event, patch) => {
    const before = store.get();
    const requested = { ...(patch || {}) };
    if (requested.bedtimeMode === true) requested.watchMode = false;
    if (requested.watchMode === true) requested.bedtimeMode = false;
    const settings = store.update(requested);

    if (before.alwaysOnTop !== settings.alwaysOnTop && petWindow) {
      petWindow.setAlwaysOnTop(settings.alwaysOnTop);
    }
    if (before.launchAtLogin !== settings.launchAtLogin) {
      applyLoginSetting(settings.launchAtLogin);
    }
    if (!before.wander && settings.wander) scheduleWander();
    if (before.wander && !settings.wander) clearTimeout(wanderTimer);
    if (!before.observePages && settings.observePages) {
      observePage().then((context) => sendComment(pageComment(context), 'page'));
    }
    if (before.observePages && !settings.observePages) pageContext = null;
    if (before.bedtimeMode !== settings.bedtimeMode
        || before.watchMode !== settings.watchMode) {
      syncModes(before, settings, !before.watchMode && settings.watchMode);
    }

    return settings;
  });

  ipcMain.handle('pet:open-privacy-settings', () => openPrivacySettings());
  ipcMain.handle('pet:open-screen-settings', () => openScreenSettings());

  ipcMain.on('pet:panel-open', (_event, open) => {
    panelOpen = open;
  });

  ipcMain.on('pet:ignore-mouse', (_event, ignore) => {
    if (!petWindow || petWindow.isDestroyed()) return;
    petWindow.setIgnoreMouseEvents(ignore, { forward: true });
  });

  ipcMain.on('pet:drag-by', (_event, delta) => {
    if (!petWindow || isMoving) return;
    const dx = Number(delta && delta.dx);
    const dy = Number(delta && delta.dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    isDragging = true;
    const [x, y] = petWindow.getPosition();
    petWindow.setPosition(Math.round(x + dx), Math.round(y + dy), false);
  });

  ipcMain.on('pet:drag-end', () => {
    isDragging = false;
    persistPosition();
  });

  ipcMain.on('pet:quit', () => app.quit());
}

async function observePage() {
  let context = await observer.observe();
  const frontmostIsSelf = context.app === character.name
    || context.app === app.getName()
    || context.app === 'Electron';

  if (frontmostIsSelf && petWindow && !petWindow.isDestroyed()) {
    const wasVisible = petWindow.isVisible();
    app.hide();
    await new Promise((resolve) => setTimeout(resolve, 180));
    context = await observer.observe();
    app.show();
    if (wasVisible) petWindow.showInactive();
  }

  pageContext = context;
  return pageContext;
}

function sendComment(text, kind) {
  if (!petWindow || petWindow.isDestroyed() || !text) return;
  petWindow.webContents.send('pet:comment', { text, kind });
}

function scheduleIdleComments() {
  clearInterval(idleTimer);
  idleTimer = setInterval(async () => {
    const settings = store.get();
    if (settings.bedtimeMode || settings.watchMode || !settings.idleComments
        || panelOpen || isDragging || isMoving) return;

    if (settings.observePages && (!pageContext || Math.random() > 0.55)) {
      await observePage();
    }

    const line = settings.observePages && pageContext && Math.random() > 0.45
      ? pageComment(pageContext)
      : pick(character.idleLines || idleLines);
    sendComment(line, 'idle');
  }, IDLE_COMMENT_MS);
}

function scheduleInbox() {
  clearInterval(inboxTimer);
  inboxTimer = setInterval(() => {
    try {
      const settings = store.get();
      const entries = inboxReader.pollEntries();
      for (const entry of entries) {
        const isDream = entry.source === 'dream';
        if (settings.watchMode) continue;
        if (isDream !== settings.bedtimeMode) continue;
        sendComment(entry.text, isDream ? 'dream' : 'scheduled');
      }
    } catch (error) {
      console.warn('[inbox] read failed:', error.message);
    }
  }, 1500);
}

function scheduleDreams() {
  clearTimeout(dreamTimer);
  if (!store || !store.get().bedtimeMode) return;

  dreamTimer = setTimeout(() => {
    if (store.get().bedtimeMode) {
      sendComment(pick(character.dreamLines), 'dream');
      scheduleDreams();
    }
  }, DREAM_COMMENT_MS);
}

function scheduleWander() {
  clearTimeout(wanderTimer);
  if (!store || !store.get().wander || store.get().bedtimeMode || store.get().watchMode) return;

  const delay = WANDER_MIN_MS + Math.round(Math.random() * (WANDER_MAX_MS - WANDER_MIN_MS));
  wanderTimer = setTimeout(async () => {
    await wanderNow(false);
    scheduleWander();
  }, delay);
}

async function wanderNow(userRequested) {
  if (!petWindow || isMoving || isDragging || panelOpen || store.get().bedtimeMode
      || store.get().watchMode
      || !store.get().wander && !userRequested) {
    return;
  }

  const current = petWindow.getBounds();
  const display = screen.getDisplayNearestPoint({
    x: current.x + Math.round(current.width / 2),
    y: current.y + Math.round(current.height / 2)
  });
  const area = display.workArea;
  const margin = 12;
  const maxX = area.x + area.width - WINDOW_WIDTH - margin;
  const maxY = area.y + area.height - WINDOW_HEIGHT - margin;
  const targetX = clamp(
    current.x + Math.round((Math.random() - 0.5) * 520),
    area.x + margin,
    maxX
  );
  const targetY = clamp(
    current.y + Math.round((Math.random() - 0.5) * 260),
    area.y + margin,
    maxY
  );

  await animateWindow(current.x, current.y, targetX, targetY, 1200);
  persistPosition();
}

function animateWindow(fromX, fromY, toX, toY, duration) {
  return new Promise((resolve) => {
    isMoving = true;
    if (petWindow) petWindow.webContents.send('pet:moving', true);
    const started = Date.now();

    const frame = () => {
      if (!petWindow || petWindow.isDestroyed()) {
        isMoving = false;
        resolve();
        return;
      }

      const progress = Math.min(1, (Date.now() - started) / duration);
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const nextX = Math.round(fromX + (toX - fromX) * eased);
      const nextY = Math.round(fromY + (toY - fromY) * eased);
      if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
        console.warn('[wander] stopped invalid window coordinates', { nextX, nextY });
        isMoving = false;
        petWindow.webContents.send('pet:moving', false);
        resolve();
        return;
      }

      try {
        petWindow.setPosition(nextX, nextY, false);
      } catch (error) {
        console.warn('[wander] window movement stopped:', error.message);
        isMoving = false;
        if (!petWindow.isDestroyed()) petWindow.webContents.send('pet:moving', false);
        resolve();
        return;
      }

      if (progress < 1) {
        setTimeout(frame, 16);
      } else {
        isMoving = false;
        petWindow.webContents.send('pet:moving', false);
        resolve();
      }
    };

    frame();
  });
}

function persistPosition() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (!petWindow || petWindow.isDestroyed()) return;
    const [x, y] = petWindow.getPosition();
    store.update({ windowPosition: { x, y } });
  }, 180);
}

function applyLoginSetting(enabled) {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    path: process.execPath
  });
}

function openPrivacySettings() {
  if (process.platform === 'darwin') {
    return shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_Automation'
    );
  }
  if (process.platform === 'win32') {
    return shell.openExternal('ms-settings:privacy');
  }
  return Promise.resolve(false);
}

function openScreenSettings() {
  if (process.platform === 'darwin') {
    return shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    );
  }
  if (process.platform === 'win32') {
    return shell.openExternal('ms-settings:privacy-screencapture');
  }
  return Promise.resolve(false);
}

function syncModes(_before, settings, watchImmediately = false) {
  if (settings.bedtimeMode || settings.watchMode) clearTimeout(wanderTimer);
  else if (settings.wander) scheduleWander();
  scheduleDreams();
  scheduleWatch(watchImmediately);
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:settings', settings);
  }
}

function scheduleWatch(immediate = false) {
  clearTimeout(watchTimer);
  if (!store || !store.get().watchMode) return;
  const delay = immediate
    ? (process.env.DESKTOP_COMPANION_SMOKE === '1' ? 500 : 1400)
    : WATCH_MIN_MS + Math.round(Math.random() * (WATCH_MAX_MS - WATCH_MIN_MS));
  watchTimer = setTimeout(async () => {
    await watchNow();
    if (store && store.get().watchMode) scheduleWatch(false);
  }, delay);
}

async function watchNow() {
  if (watchInFlight || !store || !store.get().watchMode) return;
  watchInFlight = true;
  let capture = null;
  try {
    if (!visionBridge.enabled) {
      notifyWatchFailure(
        'vision-disabled',
        'Movie mode is ready, but its M3 eye is not configured on this installation.'
      );
      return;
    }
    if (!modelBridge.enabled) {
      notifyWatchFailure(
        'text-disabled',
        'Movie mode needs its DeepSeek Flash voice before I can react to what M3 sees.'
      );
      return;
    }
    capture = await watchObserver.capture();
    if (!capture.ok) {
      notifyWatchFailure(capture.code, capture.error);
      return;
    }
    if (capture.mediaType !== 'video') {
      notifyWatchFailure(
        'native-video-unavailable',
        'The streaming window did not yield a native video clip, so I left that beat unseen.'
      );
      return;
    }
    const context = [
      'Watch With Me is explicitly enabled.',
      'This is an ' + capture.mediaType + ' sampled only from the active ' + capture.service + ' window.',
      'Describe the visible action across the sequence factually and do not infer plot beyond it.',
      capture.page && capture.page.title ? 'Current title: ' + capture.page.title : ''
    ].filter(Boolean).join(' ');
    const description = await visionBridge.describe(capture.mediaPath, context);
    if (!store.get().watchMode) return;
    if (/\b(?:black|blank|solid dark|no visible (?:video|content|scene)|protected content)\b/i
      .test(description)) {
      notifyWatchFailure(
        'drm-blackout',
        capture.service + ' is giving my eyes a protected black frame. I can see the window, but not the film inside it.'
      );
      return;
    }
    const line = await modelBridge.reactToVision(description, {
      service: capture.service,
      title: capture.page && capture.page.title
    }, recentWatchLines);
    if (!store.get().watchMode) return;
    if (!line) throw new Error('DeepSeek Flash returned no Watch With Me reaction');
    const reaction = line;
    recentWatchLines = [...recentWatchLines, reaction].slice(-3);
    watchFailureCode = '';
    sendComment(reaction, 'watch');
  } catch (error) {
    console.warn('[watch] look failed:', error.message);
    notifyWatchFailure('watch-error', 'My movie eye missed that beat. I will try again in a few minutes.');
  } finally {
    if (capture) watchObserver.cleanup(capture);
    watchInFlight = false;
  }
}

function notifyWatchFailure(code, line) {
  if (!line || watchFailureCode === code || !store.get().watchMode) return;
  watchFailureCode = code;
  sendComment(line, 'watch-status');
}

function showContextMenu() {
  if (!petWindow) return;
  const settings = store.get();
  const menu = Menu.buildFromTemplate([
    {
      label: settings.bedtimeMode ? 'Wake up' : 'Bedtime',
      click: () => {
        const before = store.get();
        const next = store.update({
          bedtimeMode: !before.bedtimeMode,
          watchMode: false
        });
        syncModes(before, next);
      }
    },
    {
      label: settings.watchMode ? 'Stop watching' : 'Watch with me',
      click: () => {
        const before = store.get();
        const next = store.update({
          watchMode: !before.watchMode,
          bedtimeMode: false
        });
        syncModes(before, next, next.watchMode);
      }
    },
    { type: 'separator' },
    {
      label: settings.wander ? 'Pause wandering' : 'Resume wandering',
      click: () => {
        const next = store.update({ wander: !settings.wander });
        if (next.wander) scheduleWander();
        else clearTimeout(wanderTimer);
      }
    },
    {
      label: settings.idleComments ? 'Quiet mode' : 'Resume comments',
      click: () => store.update({ idleComments: !settings.idleComments })
    },
    {
      label: settings.observePages ? 'Close page sight' : 'Open page sight',
      click: () => store.update({ observePages: !settings.observePages })
    },
    { type: 'separator' },
    { label: 'Quit ' + character.name, click: () => app.quit() }
  ]);
  menu.popup({ window: petWindow });
}

ipcMain.on('pet:context-menu', showContextMenu);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

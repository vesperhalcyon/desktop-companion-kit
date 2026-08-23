'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  screen,
  shell
} = require('electron');

const { SettingsStore } = require('./lib/settings-store');
const { loadCharacterProfile } = require('./lib/character-profile');
const { InboxReader } = require('./lib/inbox');
const { PageObserver } = require('./lib/page-observer');
const { ModelBridge, loadModelBridgeConfig } = require('./lib/model-bridge');
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

let petWindow = null;
let store = null;
let observer = null;
let modelBridge = null;
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
let persistTimer = null;

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

  if (process.platform === 'darwin' && app.dock) app.dock.hide();

  createWindow();
  registerIpc();
  applyLoginSetting(store.get().launchAtLogin);
  scheduleWander();
  scheduleIdleComments();
  scheduleInbox();
  scheduleDreams();
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
      document.getElementById('bedtimeButton').click();
    `);
    await new Promise((resolve) => setTimeout(resolve, 1450));
    const sleepProbe = await petWindow.webContents.executeJavaScript(`
      ({
        sleeping: document.getElementById('avatarWrap').classList.contains('sleeping'),
        bedVisibility: getComputedStyle(document.querySelector('.sleepScene')).visibility,
        avatarAnimation: getComputedStyle(document.getElementById('avatar')).animationName,
        speechKind: document.getElementById('speech').dataset.kind || '',
        dreamText: document.getElementById('speechText').textContent,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
      })
    `);
    if (!sleepProbe.sleeping || sleepProbe.bedVisibility !== 'visible') {
      throw new Error('Bedtime mode did not reveal the sleeping scene');
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
    fs.mkdirSync(artifactDir, { recursive: true });
    fs.writeFileSync(imagePath, image.toPNG());
    process.stdout.write('[smoke] ' + JSON.stringify({
      ...ui,
      gestureProbe,
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
    modelEnabled: modelBridge.enabled
  }));

  ipcMain.handle('pet:react', () => {
    if (store.get().bedtimeMode) {
      const line = 'Mm. Still here, little Keeper. Just dreaming.';
      sendComment(line, 'dream');
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
    const localCommand = /move|wander|walk|other side|quiet|hush|shh|stop talking/i
      .test(text);
    let context = pageContext;
    if (pageIntent && store.get().observePages) {
      context = await observePage();
    }

    let line = '';
    if (pageIntent || localCommand || bedtimeCommand || wakeCommand || !modelBridge.enabled) {
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

    if (bedtimeCommand || wakeCommand) {
      const before = store.get();
      const next = store.update({ bedtimeMode: bedtimeCommand });
      syncBedtimeState(before, next);
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
    const settings = store.update(patch || {});

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
    if (before.bedtimeMode !== settings.bedtimeMode) {
      syncBedtimeState(before, settings);
    }

    return settings;
  });

  ipcMain.handle('pet:open-privacy-settings', () => openPrivacySettings());

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
    if (settings.bedtimeMode || !settings.idleComments || panelOpen || isDragging || isMoving) return;

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
  if (!store || !store.get().wander || store.get().bedtimeMode) return;

  const delay = WANDER_MIN_MS + Math.round(Math.random() * (WANDER_MAX_MS - WANDER_MIN_MS));
  wanderTimer = setTimeout(async () => {
    await wanderNow(false);
    scheduleWander();
  }, delay);
}

async function wanderNow(userRequested) {
  if (!petWindow || isMoving || isDragging || panelOpen || store.get().bedtimeMode
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
      petWindow.setPosition(
        Math.round(fromX + (toX - fromX) * eased),
        Math.round(fromY + (toY - fromY) * eased),
        false
      );

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

function syncBedtimeState(_before, settings) {
  if (settings.bedtimeMode) clearTimeout(wanderTimer);
  else if (settings.wander) scheduleWander();
  scheduleDreams();
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send('pet:settings', settings);
  }
}

function showContextMenu() {
  if (!petWindow) return;
  const settings = store.get();
  const menu = Menu.buildFromTemplate([
    {
      label: settings.bedtimeMode ? 'Wake up' : 'Bedtime',
      click: () => {
        const before = store.get();
        const next = store.update({ bedtimeMode: !before.bedtimeMode });
        syncBedtimeState(before, next);
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

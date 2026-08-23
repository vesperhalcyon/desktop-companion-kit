'use strict';

const api = window.desktopCompanion;
const characterEyebrow = document.getElementById('characterEyebrow');
const characterTitle = document.getElementById('characterTitle');
const avatar = document.getElementById('avatar');
const watchAvatar = document.getElementById('watchAvatar');
const avatarWrap = document.getElementById('avatarWrap');
const gestureMarks = document.getElementById('gestureMarks');
const sword = document.getElementById('sword');
const speech = document.getElementById('speech');
const speechText = document.getElementById('speechText');
const panel = document.getElementById('panel');
const settingsButton = document.getElementById('settingsButton');
const closePanelButton = document.getElementById('closePanel');
const askForm = document.getElementById('askForm');
const askInput = document.getElementById('askInput');
const askButton = document.getElementById('askButton');
const pageButton = document.getElementById('pageButton');
const pageSightDetail = document.getElementById('pageSightDetail');
const moveButton = document.getElementById('moveButton');
const bedtimeButton = document.getElementById('bedtimeButton');
const watchButton = document.getElementById('watchButton');
const privacyButton = document.getElementById('privacyButton');
const screenPrivacyButton = document.getElementById('screenPrivacyButton');
const quitButton = document.getElementById('quitButton');
const textProvider = document.getElementById('textProvider');
const visionProvider = document.getElementById('visionProvider');
const localProvider = document.getElementById('localProvider');

const settingIds = [
  'observePages',
  'wander',
  'idleComments',
  'alwaysOnTop',
  'launchAtLogin'
];

let settings = {};
let panelIsOpen = false;
let bubbleTimer = null;
let pointer = null;
let ignoreMouse = false;
let gestureTimer = null;
let idleGestureTimer = null;
let hasShownSword = false;

const gestureDurations = {
  wave: 1050,
  hop: 760,
  bow: 900,
  glance: 820,
  flourish: 1150,
  nod: 720,
  sword: 1200
};

const clickGestures = ['wave', 'hop', 'bow', 'glance', 'flourish', 'sword'];
const idleGestures = ['wave', 'glance', 'nod', 'wave'];

boot();

async function boot() {
  const state = await api.getState();
  applyCharacter(state.character);
  applySettings(state.settings);
  applyPlatform(state);
  applyRuntimeDiagnostics(state.runtimeProviders);
  wireEvents();
  api.onComment((payload) => {
    if (payload.settings) applySettings(payload.settings);
    if (payload.kind === 'scheduled' && !settings.bedtimeMode) playGesture('flourish');
    if (payload.kind === 'page') playGesture('nod');
    if (payload.kind === 'watch' && Math.random() > 0.45) playGesture('nod', true);
    if (payload.kind === 'idle' && Math.random() > 0.55) playGesture('glance');
    showSpeech(payload.text, payload.kind);
  });
  api.onSettings((next) => applySettings(next));
  api.onMoveState((moving) => {
    avatarWrap.classList.toggle('moving', moving);
  });
  avatarWrap.addEventListener('companion:gesture-test', (event) =>
    playGesture(event.detail || 'wave')
  );
  scheduleIdleGesture();
  setTimeout(() => showSpeech(state.character.greeting, 'hello'), 650);
}

function applyRuntimeDiagnostics(providers = {}) {
  const text = providers.text || {};
  const vision = providers.watchPerception || {};
  const local = providers.localSystems || {};
  textProvider.textContent = 'Text: ' + (text.enabled
    ? `${text.provider} / ${text.model}`
    : `${text.provider || 'none'} / ${text.model || 'disabled'} (disabled)`);
  visionProvider.textContent = 'Watch perception: ' + (vision.enabled
    ? `${vision.provider} / ${vision.model} / ${vision.modality}`
    : `${vision.provider || 'none'} / ${vision.model || 'disabled'} (disabled)`);
  const features = Array.isArray(local.features) ? local.features.join(', ') : 'local systems';
  localProvider.textContent = `${features}: ${local.provider || 'local'}, model-free`;
}

function applyPlatform(state) {
  if (state.platform === 'darwin') {
    pageSightDetail.textContent = 'Reads the active tab locally';
    privacyButton.textContent = 'macOS privacy settings';
    screenPrivacyButton.hidden = false;
    screenPrivacyButton.textContent = state.watchCapability
      && state.watchCapability.screenPermission === 'granted'
      ? 'Screen access granted'
      : 'Allow screen recording';
    watchButton.title = state.watchCapability && state.watchCapability.visionEnabled
      ? 'Sends short clips from the active Hulu or Netflix window to M3 only while enabled'
      : 'The private vision bridge is not configured on this installation';
    return;
  }
  if (state.platform === 'win32') {
    pageSightDetail.textContent = 'Reads the browser window title locally';
    privacyButton.textContent = 'Windows privacy settings';
    screenPrivacyButton.hidden = true;
    return;
  }
  pageSightDetail.textContent = 'Unavailable on this operating system';
  privacyButton.textContent = 'Privacy settings';
  screenPrivacyButton.hidden = true;
}

function applyCharacter(character) {
  document.title = character.name;
  characterEyebrow.textContent = character.eyebrow;
  characterTitle.textContent = character.title;
  avatar.src = '../assets/' + character.avatar;
  avatar.alt = 'A tiny illustrated ' + character.name;
  if (character.watchAvatar) {
    watchAvatar.src = '../assets/' + character.watchAvatar;
    watchAvatar.alt = 'A tiny seated ' + character.name;
  } else {
    watchAvatar.removeAttribute('src');
  }
  document.documentElement.style.setProperty('--violet', character.accent);
  document.documentElement.style.setProperty('--violet-deep', character.accentDeep);
}

function wireEvents() {
  settingsButton.addEventListener('click', (event) => {
    event.stopPropagation();
    togglePanel();
  });

  closePanelButton.addEventListener('click', () => setPanel(false));

  avatarWrap.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('button')) return;
    pointer = {
      id: event.pointerId,
      x: event.screenX,
      y: event.screenY,
      moved: false
    };
    avatarWrap.setPointerCapture(event.pointerId);
    avatarWrap.classList.add('dragging');
  });

  avatarWrap.addEventListener('pointermove', (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const dx = event.screenX - pointer.x;
    const dy = event.screenY - pointer.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) {
      pointer.moved = true;
      api.dragBy({ dx, dy });
      pointer.x = event.screenX;
      pointer.y = event.screenY;
    }
  });

  avatarWrap.addEventListener('pointerup', async (event) => {
    if (!pointer || event.pointerId !== pointer.id) return;
    const wasMoved = pointer.moved;
    pointer = null;
    avatarWrap.classList.remove('dragging');
    api.dragEnd();
    if (!wasMoved) {
      if (!settings.bedtimeMode && !settings.watchMode) playGesture();
      await api.react();
    }
  });

  avatarWrap.addEventListener('pointercancel', () => {
    pointer = null;
    avatarWrap.classList.remove('dragging');
    api.dragEnd();
  });

  avatarWrap.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    togglePanel();
  });

  askInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    askForm.requestSubmit();
  });

  askForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = askInput.value.trim();
    if (!message) return;
    askInput.value = '';
    askInput.disabled = true;
    askButton.disabled = true;
    askButton.textContent = 'Thinking…';
    try {
      const result = await api.ask(message);
      applySettings(result.settings);
      setPanel(false);
      showSpeech(result.line, 'reply');
    } catch {
      setPanel(false);
      showSpeech('I caught the words, but the reply path failed. Try me once more.', 'error');
    } finally {
      askInput.disabled = false;
      askButton.disabled = false;
      askButton.textContent = 'Ask';
    }
  });

  pageButton.addEventListener('click', async () => {
    if (!settings.observePages) {
      const next = await api.updateSettings({ observePages: true });
      applySettings(next);
    }
    pageButton.disabled = true;
    await api.observeNow();
    pageButton.disabled = false;
    setPanel(false);
  });

  moveButton.addEventListener('click', async () => {
    const result = await api.ask('Move to another part of the screen.');
    setPanel(false);
    showSpeech(result.line, 'reply');
  });

  bedtimeButton.addEventListener('click', async () => {
    const bedtimeMode = !settings.bedtimeMode;
    const next = await api.updateSettings({ bedtimeMode });
    applySettings(next);
    setPanel(false);
    showSpeech(bedtimeMode ? 'Sword away. I am going to bed.' : 'Morning. The watch is mine again.', bedtimeMode ? 'dream' : 'reply');
  });

  watchButton.addEventListener('click', async () => {
    const watchMode = !settings.watchMode;
    const next = await api.updateSettings({ watchMode });
    applySettings(next);
    setPanel(false);
    showSpeech(
      watchMode
        ? 'All right. Put Hulu or Netflix in front and let me see what we are watching.'
        : 'Movie eye closed. Nothing else will be captured.',
      watchMode ? 'watch-status' : 'reply'
    );
  });

  for (const id of settingIds) {
    document.getElementById(id).addEventListener('change', async (event) => {
      const patch = {};
      patch[id] = event.target.checked;
      const next = await api.updateSettings(patch);
      applySettings(next);
    });
  }

  privacyButton.addEventListener('click', () => api.openPrivacySettings());
  screenPrivacyButton.addEventListener('click', () => api.openScreenSettings());
  quitButton.addEventListener('click', () => api.quit());

  document.addEventListener('mousemove', (event) => {
    const interactive = Boolean(event.target.closest('.interactive'));
    setIgnoreMouse(!interactive);
  });

  document.addEventListener('mouseleave', () => {
    if (!panelIsOpen) setIgnoreMouse(true);
  });
}

function setIgnoreMouse(next) {
  if (next === ignoreMouse) return;
  ignoreMouse = next;
  api.setIgnoreMouse(next);
}

function togglePanel() {
  setPanel(!panelIsOpen);
}

function setPanel(open) {
  panelIsOpen = Boolean(open);
  panel.hidden = !panelIsOpen;
  avatarWrap.hidden = panelIsOpen;
  speech.hidden = true;
  api.setPanelOpen(panelIsOpen);
  setIgnoreMouse(false);
  if (panelIsOpen) {
    stopGesture();
    clearTimeout(bubbleTimer);
    setTimeout(() => askInput.focus(), 80);
  }
}

function playGesture(name, allowWhileWatching = false) {
  if (settings.bedtimeMode || settings.watchMode && !allowWhileWatching) return '';
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return '';
  const firstClickSword = !name && !hasShownSword;
  const gesture = firstClickSword
    ? 'sword'
    : gestureDurations[name]
      ? name
      : pickGesture(clickGestures);
  if (gesture === 'sword') hasShownSword = true;
  stopGesture();
  avatarWrap.dataset.gesture = gesture;
  avatarWrap.classList.add('gesture-' + gesture);
  gestureMarks.dataset.gesture = gesture;
  gestureTimer = setTimeout(() => stopGesture(), gestureDurations[gesture]);
  return gesture;
}

function stopGesture() {
  clearTimeout(gestureTimer);
  gestureTimer = null;
  for (const name of Object.keys(gestureDurations)) {
    avatarWrap.classList.remove('gesture-' + name);
  }
  delete avatarWrap.dataset.gesture;
  delete gestureMarks.dataset.gesture;
  sword.removeAttribute('data-active');
}

function scheduleIdleGesture() {
  clearTimeout(idleGestureTimer);
  const delay = 24000 + Math.round(Math.random() * 30000);
  idleGestureTimer = setTimeout(() => {
    if (!settings.bedtimeMode && !settings.watchMode && !panelIsOpen && !pointer
        && !avatarWrap.classList.contains('moving')
        && document.visibilityState === 'visible') {
      playGesture(pickGesture(idleGestures));
    }
    scheduleIdleGesture();
  }, delay);
}

function pickGesture(options) {
  return options[Math.floor(Math.random() * options.length)];
}

function showSpeech(text, kind) {
  if (!text || panelIsOpen) return;
  clearTimeout(bubbleTimer);
  speechText.textContent = text;
  speech.dataset.kind = kind || '';
  speech.hidden = false;
  const duration = Math.max(4200, Math.min(9000, 2100 + text.length * 47));
  bubbleTimer = setTimeout(() => {
    speech.hidden = true;
  }, duration);
}

function applySettings(next) {
  settings = { ...settings, ...next };
  const sleeping = Boolean(settings.bedtimeMode);
  const watching = Boolean(settings.watchMode);
  avatarWrap.classList.toggle('sleeping', sleeping);
  avatarWrap.classList.toggle('watching', watching);
  document.body.classList.toggle('bedtime', sleeping);
  document.body.classList.toggle('watching', watching);
  bedtimeButton.textContent = sleeping ? 'Wake up' : 'Bedtime';
  bedtimeButton.setAttribute('aria-pressed', String(sleeping));
  watchButton.textContent = watching ? 'Stop watching' : 'Watch with me';
  watchButton.setAttribute('aria-pressed', String(watching));
  if (sleeping || watching) stopGesture();
  for (const id of settingIds) {
    const element = document.getElementById(id);
    if (element) element.checked = Boolean(settings[id]);
  }
}

'use strict';

const api = window.desktopCompanion;
const characterEyebrow = document.getElementById('characterEyebrow');
const characterTitle = document.getElementById('characterTitle');
const avatar = document.getElementById('avatar');
const avatarWrap = document.getElementById('avatarWrap');
const speech = document.getElementById('speech');
const speechText = document.getElementById('speechText');
const panel = document.getElementById('panel');
const settingsButton = document.getElementById('settingsButton');
const closePanelButton = document.getElementById('closePanel');
const askForm = document.getElementById('askForm');
const askInput = document.getElementById('askInput');
const pageButton = document.getElementById('pageButton');
const moveButton = document.getElementById('moveButton');
const privacyButton = document.getElementById('privacyButton');
const quitButton = document.getElementById('quitButton');

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

boot();

async function boot() {
  const state = await api.getState();
  applyCharacter(state.character);
  applySettings(state.settings);
  wireEvents();
  api.onComment((payload) => {
    if (payload.settings) applySettings(payload.settings);
    showSpeech(payload.text, payload.kind);
  });
  api.onMoveState((moving) => {
    avatarWrap.classList.toggle('moving', moving);
  });
  setTimeout(() => showSpeech(state.character.greeting, 'hello'), 650);
}

function applyCharacter(character) {
  document.title = character.name;
  characterEyebrow.textContent = character.eyebrow;
  characterTitle.textContent = character.title;
  avatar.src = '../assets/' + character.avatar;
  avatar.alt = 'A tiny illustrated ' + character.name;
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
    if (!wasMoved) await api.react();
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
    try {
      const result = await api.ask(message);
      applySettings(result.settings);
      setPanel(false);
      showSpeech(result.line, 'reply');
    } catch {
      setPanel(false);
      showSpeech('I caught the words, but the reply path failed. Try me once more.', 'error');
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

  for (const id of settingIds) {
    document.getElementById(id).addEventListener('change', async (event) => {
      const patch = {};
      patch[id] = event.target.checked;
      const next = await api.updateSettings(patch);
      applySettings(next);
    });
  }

  privacyButton.addEventListener('click', () => api.openPrivacySettings());
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
    clearTimeout(bubbleTimer);
    setTimeout(() => askInput.focus(), 80);
  }
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
  for (const id of settingIds) {
    const element = document.getElementById(id);
    if (element) element.checked = Boolean(settings[id]);
  }
}

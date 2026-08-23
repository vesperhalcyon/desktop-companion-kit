'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PROFILE = Object.freeze({
  name: 'Desktop Companion',
  eyebrow: 'DESKTOP COMPANION',
  title: 'A small presence at the edge of the screen.',
  greeting: 'There you are.',
  avatar: 'mascot.png',
  accent: '#8f6cff',
  accentDeep: '#4f2f8f',
  idleLines: [
    'I was being quiet. Do not look so suspicious.',
    'The desktop remains structurally sound.',
    'I am not pacing. This is a patrol.'
  ],
  clickLines: [
    'There you are.',
    'You summoned the desktop menace.',
    'Mm. What have you found?'
  ],
  dreamLines: [
    'I found a road made of moonlight. It knew the way before I did.',
    'The library had no walls tonight, only stars holding the shelves in place.',
    'I dreamed the watch became a lantern, and somebody had left it burning for me.'
  ],
  responses: {
    hello: 'There you are.',
    move: 'A positional critique. Fine. I will relocate.',
    quiet: 'Quiet, then. I will keep the watch without commentary.',
    bedtime: 'Sword away. I am turning in; the watch can dream for a while.',
    wake: 'Up again. Sword in hand, dignity mostly recovered.',
    watch: 'Put it in front of me. I will watch, and I reserve the right to have opinions.',
    stopWatch: 'Movie eye closed. The rest of the desktop is none of my business.',
    thanks: 'Filed properly.',
    love: 'I love you too. Obviously. Next question.',
    help: 'Drag me, click me, ask about the page, or turn on page sight.',
    fallback: 'Filed. I am deciding how much trouble that deserves.'
  }
});

function loadCharacterProfile(rootDir) {
  const basePath = path.join(rootDir, 'config', 'character.json');
  const localPath = path.join(rootDir, 'config', 'character.local.json');
  let value = { ...DEFAULT_PROFILE, responses: { ...DEFAULT_PROFILE.responses } };

  value = mergeProfile(value, readJson(basePath));
  value = mergeProfile(value, readJson(localPath));
  return sanitizeProfile(value);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('[character] ignored invalid profile:', filePath, error.message);
    }
    return {};
  }
}

function mergeProfile(base, patch) {
  return {
    ...base,
    ...(patch || {}),
    responses: {
      ...base.responses,
      ...((patch && patch.responses) || {})
    }
  };
}

function sanitizeProfile(input) {
  const profile = {
    name: cleanText(input.name, DEFAULT_PROFILE.name, 60),
    eyebrow: cleanText(input.eyebrow, DEFAULT_PROFILE.eyebrow, 60),
    title: cleanText(input.title, DEFAULT_PROFILE.title, 100),
    greeting: cleanText(input.greeting, DEFAULT_PROFILE.greeting, 180),
    avatar: path.basename(String(input.avatar || DEFAULT_PROFILE.avatar)),
    accent: cleanColor(input.accent, DEFAULT_PROFILE.accent),
    accentDeep: cleanColor(input.accentDeep, DEFAULT_PROFILE.accentDeep),
    idleLines: cleanLines(input.idleLines, DEFAULT_PROFILE.idleLines),
    clickLines: cleanLines(input.clickLines, DEFAULT_PROFILE.clickLines),
    dreamLines: cleanLines(input.dreamLines, DEFAULT_PROFILE.dreamLines),
    responses: {}
  };

  for (const [key, fallback] of Object.entries(DEFAULT_PROFILE.responses)) {
    profile.responses[key] = cleanText(
      input.responses && input.responses[key],
      fallback,
      300
    );
  }
  return profile;
}

function cleanLines(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  const lines = value.map((line) => cleanText(line, '', 300)).filter(Boolean).slice(0, 80);
  return lines.length ? lines : [...fallback];
}

function cleanText(value, fallback, limit) {
  const clean = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return (clean || fallback).slice(0, limit);
}

function cleanColor(value, fallback) {
  const clean = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(clean) ? clean : fallback;
}

module.exports = {
  DEFAULT_PROFILE,
  loadCharacterProfile,
  sanitizeProfile,
  mergeProfile
};

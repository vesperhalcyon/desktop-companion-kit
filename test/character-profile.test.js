'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  DEFAULT_PROFILE,
  mergeProfile,
  sanitizeProfile
} = require('../lib/character-profile');

test('profile sanitizer bounds text, colors, arrays, and avatar paths', () => {
  const profile = sanitizeProfile({
    name: '  My   Companion  ',
    eyebrow: 'HELLO',
    title: 'A title',
    greeting: 'Hi',
    avatar: '../../outside.png',
    accent: 'red',
    accentDeep: '#123abc',
    idleLines: [' One ', '', 'Two'],
    clickLines: ['Click'],
    responses: { hello: 'Welcome' }
  });

  assert.equal(profile.name, 'My Companion');
  assert.equal(profile.avatar, 'outside.png');
  assert.equal(profile.accent, DEFAULT_PROFILE.accent);
  assert.equal(profile.accentDeep, '#123abc');
  assert.deepEqual(profile.idleLines, ['One', 'Two']);
  assert.equal(profile.responses.hello, 'Welcome');
  assert.equal(profile.responses.help, DEFAULT_PROFILE.responses.help);
});

test('local profile merge preserves unspecified public defaults', () => {
  const merged = mergeProfile(DEFAULT_PROFILE, {
    name: 'Local Name',
    responses: { hello: 'Local hello' }
  });
  assert.equal(merged.name, 'Local Name');
  assert.equal(merged.responses.hello, 'Local hello');
  assert.equal(merged.responses.help, DEFAULT_PROFILE.responses.help);
});

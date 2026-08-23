'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  safeHost,
  classify,
  pageComment,
  replyToUser,
  isPageIntent,
  isPageVisibilityQuestion,
  pageVisibilityReply,
  cleanTitle
} = require('../lib/commentary');

test('safeHost normalizes ordinary URLs', () => {
  assert.equal(safeHost('https://www.example.com/path'), 'example.com');
  assert.equal(safeHost('not a url'), '');
});

test('classify recognizes common page families', () => {
  assert.equal(classify({ title: 'Pull request · GitHub' }), 'code');
  assert.equal(classify({ url: 'https://shop.example/product/1' }), 'shopping');
  assert.equal(classify({ text: 'Ingredients and bake for twenty minutes' }), 'food');
});

test('pageComment remains useful when observation is unavailable', () => {
  assert.match(pageComment({ ok: false, permissionHint: true }, 0), /Automation permission/);
  assert.match(pageComment({ ok: false }, 0), /Page sight/);
});

test('pageComment uses visible page context without echoing long content', () => {
  const comment = pageComment({
    ok: true,
    title: 'A very serious pull request',
    url: 'https://github.com/example/repo/pull/1',
    text: 'code'
  }, 0);
  assert.match(comment, /Documentation|semicolon|instructions|fault/i);
  assert.ok(comment.length < 180);
});

test('replyToUser understands core desktop-pet intents', () => {
  assert.match(replyToUser('Hello'), /There you are/);
  assert.match(replyToUser('What can you do?'), /Drag me/);
  assert.match(replyToUser('Please move'), /relocate/);
  assert.match(replyToUser('Time for bed'), /turning in|Sword away/);
  assert.match(replyToUser('Wake up'), /Up again/);
});

test('page intent stays on the local observation path', () => {
  assert.equal(isPageIntent('Can you see the page?'), true);
  assert.equal(isPageVisibilityQuestion('Can you read this website?'), true);
  assert.equal(isPageIntent('Tell me something about yourself.'), false);
});

test('page visibility replies report observed content precisely', () => {
  const context = {
    ok: true,
    app: 'Google Chrome',
    title: 'Example page',
    text: 'visible page text'
  };
  const reply = pageVisibilityReply(context);
  assert.match(reply, /^Yes\. I can see "Example page" in Google Chrome/);
  assert.match(reply, /17 characters of visible page text/);
  assert.equal(replyToUser('Can you see the page?', context), reply);
});

test('page visibility is explicit about Windows title-only sight', () => {
  const reply = pageVisibilityReply({
    ok: true,
    platform: 'win32',
    capability: 'title',
    app: 'Google Chrome',
    title: 'Example page',
    url: '',
    text: ''
  });
  assert.match(reply, /window title/);
  assert.match(reply, /does not read the page body/);
});

test('cleanTitle bounds untrusted page titles', () => {
  const title = cleanTitle('x'.repeat(200));
  assert.equal(title.length, 82);
  assert.match(title, /\.\.\.$/);
});

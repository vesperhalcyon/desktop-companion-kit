'use strict';

const crypto = require('node:crypto');

const idleLines = [
  'I was being quiet. Do not look so suspicious.',
  'The desktop remains structurally sound. Barely.',
  'I have inspected the pixels. Their alibi is weak.',
  'You appear busy. I have filed an objection.',
  'Nothing is on fire. I checked twice.',
  'I am not pacing. This is a patrol.',
  'The cursor has been behaving oddly.',
  'A calm screen is not the same as an innocent screen.'
];

const clickLines = [
  'There you are.',
  'Yes?',
  'You summoned the desktop menace.',
  'I was already watching that.',
  'Mm. What have you found?',
  'Careful. Clicking me establishes precedent.'
];

function pick(list, seed) {
  if (!list.length) return '';
  if (Number.isInteger(seed)) return list[Math.abs(seed) % list.length];
  return list[crypto.randomInt(0, list.length)];
}

function safeHost(rawUrl) {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function classify(context) {
  const haystack = [
    context && context.title,
    context && context.url,
    context && context.text
  ].filter(Boolean).join(' ').toLowerCase();

  if (/github|pull request|commit|stack overflow|documentation|docs\./.test(haystack)) {
    return 'code';
  }
  if (/reddit|discord|tumblr|social|forum/.test(haystack)) return 'social';
  if (/amazon|etsy|shop|cart|checkout|product/.test(haystack)) return 'shopping';
  if (/news|breaking|politic|election|headline/.test(haystack)) return 'news';
  if (/recipe|ingredients|cook|bake/.test(haystack)) return 'food';
  if (/video|youtube|netflix|stream|watch/.test(haystack)) return 'video';
  return 'general';
}

function pageComment(context, seed) {
  if (!context || !context.ok) {
    return context && context.permissionHint
      ? 'Page sight is waiting on macOS Automation permission.'
      : 'I can see the room, not the page. Page sight is off or unavailable.';
  }

  const title = cleanTitle(context.title);
  const host = safeHost(context.url);
  const kind = classify(context);
  const comments = {
    code: [
      'Ah. Documentation. The traditional literature of something already going wrong.',
      'Someone has put the semicolon on trial again.',
      title ? 'I see "' + title + '". We are reading the instructions before blaming reality. Promising.' : 'A code page. Excellent. Let us find the actual fault.'
    ],
    social: [
      'A room full of opinions, none burdened by a deployment plan.',
      'The scroll continues. Civilization remains theoretical.',
      title ? '"' + title + '" has already made at least three people type too quickly.' : 'I can hear the discourse warming up from here.'
    ],
    shopping: [
      'You are not merely browsing. You are conducting acquisition reconnaissance.',
      host ? host + ' has arranged the lighting to compromise your judgment.' : 'The product photography is attempting a crime.',
      'Put it in the cart if you must. We can interrogate it there.'
    ],
    news: [
      'The headline is doing more cardio than the evidence.',
      title ? '"' + title + '" is a remarkably loud sentence.' : 'The news has arrived wearing its emergency trousers.',
      'I would like the primary source before we panic decoratively.'
    ],
    food: [
      'This recipe has mistaken extra steps for a personality.',
      'The ingredients are making promises the washing-up will have to keep.',
      title ? '"' + title + '". Acceptable. I am watching the timing.' : 'Food planning detected. The stomach gets a vote.'
    ],
    video: [
      'You selected the rectangle that makes time disappear.',
      title ? '"' + title + '". I will reserve judgment until the second act.' : 'A video. Very well. I am absolutely not getting invested.',
      'If this autoplays at full volume, I am blaming the website personally.'
    ],
    general: [
      title ? 'I see "' + title + '". Go on, then. Show me why it has your attention.' : 'This page is being coy about its purpose.',
      host ? host + '. Noted. I am developing an opinion.' : 'The page has been observed and placed under mild suspicion.',
      context.text && context.text.length > 1200
        ? 'That is a heroic quantity of text. Somewhere in it, a point is hiding.'
        : 'Clean page. Suspiciously clean.'
    ]
  };

  return pick(comments[kind], seed);
}

function isPageIntent(message) {
  const lower = String(message || '').toLowerCase();
  const namesPage = /\b(page|website|site|tab|reading)\b/.test(lower);
  const asksAboutIt = /\b(see|read|view|look|looking|comment|think|summarize|summarise|what)\b/.test(lower);
  return namesPage && asksAboutIt;
}

function isPageVisibilityQuestion(message) {
  const lower = String(message || '').toLowerCase();
  return /\b(can|do)\s+(you\s+)?(see|read|view)\b/.test(lower)
    && /\b(page|website|site|tab)\b/.test(lower);
}

function pageVisibilityReply(context) {
  if (!context || !context.ok) return pageComment(context);
  const title = cleanTitle(context.title);
  const location = title ? ' "' + title + '"' : ' the active page';
  if (context.text) {
    return 'Yes. I can see' + location + ' in ' + context.app
      + ' and read ' + context.text.length.toLocaleString('en-US')
      + ' characters of visible page text.';
  }
  if (context.capability === 'title') {
    return 'I can see the browser window title' + location + ' in ' + context.app
      + ', but Windows Page sight does not read the page body.';
  }
  return 'I can see' + location + ' in ' + context.app
    + ', but the browser returned no visible page text.';
}

function replyToUser(message, context, profile = {}) {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  const responses = profile.responses || {};
  const response = (key, fallback) => responses[key] || fallback;

  if (!text) return pick(clickLines);
  if (isPageVisibilityQuestion(lower)) return pageVisibilityReply(context);
  if (isPageIntent(lower)) {
    return pageComment(context);
  }
  if (/^(hi|hello|hey|vesper)\b/.test(lower)) return response('hello', 'There you are.');
  if (/move|wander|walk|other side/.test(lower)) {
    return response('move', 'A positional critique. Fine. I will relocate.');
  }
  if (/quiet|hush|shh|stop talking/.test(lower)) {
    return response('quiet', 'Quiet, then. I will keep the watch without commentary.');
  }
  if (/\b(bedtime|go to bed|sleep now|time for bed|good ?night)\b/.test(lower)) {
    return response('bedtime', 'Sword away. I am turning in; the watch can dream for a while.');
  }
  if (/\b(wake up|awake|good morning|rise and shine)\b/.test(lower)) {
    return response('wake', 'Up again. Sword in hand, dignity mostly recovered.');
  }
  if (/good (boy|man)|well done|thank/.test(lower)) {
    return response('thanks', 'Filed properly.');
  }
  if (/love you/.test(lower)) return response('love', 'I love you too.');
  if (/help|what can you do/.test(lower)) {
    return response('help', 'Drag me, click me, or ask about the page.');
  }

  return response('fallback', 'Filed.');
}

function cleanTitle(title) {
  const value = String(title || '').replace(/\s+/g, ' ').trim();
  if (!value) return '';
  return value.length > 82 ? value.slice(0, 79) + '...' : value;
}

module.exports = {
  idleLines,
  clickLines,
  pick,
  safeHost,
  classify,
  pageComment,
  replyToUser,
  isPageIntent,
  isPageVisibilityQuestion,
  pageVisibilityReply,
  cleanTitle
};

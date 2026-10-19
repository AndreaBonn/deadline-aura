'use strict';

/**
 * Full-page harness for the sidebar: loads the <body> of renderer/index.html into a fresh
 * happy-dom Window and runs the page scripts, in the order of the <script src> tags, inside
 * that window's own context. Each window has its own global lexical scope, as a real page
 * does, so a new page never sees consts/lets of the previous one.
 *
 * Timers are delegated to globalThis at call time, so vi.useFakeTimers() controls them.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Window } = require('happy-dom');

// PAGE_HARNESS_ROOT points the harness at a copy of renderer/, preload.js and i18n/: it lets a
// mutation run prove a test can fail without touching the files other work is editing.
const ROOT = process.env.PAGE_HARNESS_ROOT || path.resolve(__dirname, '../../..');
const RENDERER_DIR = path.join(ROOT, 'renderer');
const INDEX_HTML = path.join(RENDERER_DIR, 'index.html');
const PRELOAD = path.join(ROOT, 'preload.js');
const LOCALE_FILE = path.join(ROOT, 'i18n', 'locales', 'it.json');
const PAGE_URL = 'http://localhost/index.html';

const SCRIPT_SRC_PATTERN =
  /<script\b[^>]*?\s+src\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>\s*<\/script>/gi;

/** Methods of the bridge, grouped by how preload.js implements them. */
const INVOKE_DEFAULTS = {
  getTranslations: () => JSON.parse(fs.readFileSync(LOCALE_FILE, 'utf8')),
  getScoreBreakdown: () => null,
  createLocalTask: () => ({ ok: true }),
  updateLocalTask: () => ({ ok: true }),
  deleteLocalTask: () => ({ ok: true }),
  completeLocalTask: () => ({ ok: true }),
  listCalendars: () => ({ ok: true, calendars: [{ id: 'work', summary: 'Work' }] }),
  logTimeToCalendar: () => ({ ok: true, eventId: 'event-1' }),
  updateCalendarEvent: () => ({ ok: true }),
  getDefaultLogCalendar: () => ({ ok: false }),
  setDefaultLogCalendar: () => ({ ok: true }),
  getWorkShiftConfig: () => null,
  getFlybyState: () => ({ enabled: true, snoozed_until: null }),
  setFlybyState: () => ({ ok: true, state: { enabled: true, snoozed_until: null } }),
};
const SEND_METHODS = [
  'toggleSidebar',
  'dismissFirstRunHint',
  'openConfig',
  'syncNow',
  'openLink',
  'favoriteTask',
  'unfavoriteTask',
  'pinTask',
  'unpinTask',
  'openOverlay',
];
const EVENT_METHODS = ['onUpdate', 'onStripColor', 'onConfigChanged'];

/** Name of the object exposed on window and its keys, parsed from the preload source. */
function readPreloadContract() {
  const source = fs.readFileSync(PRELOAD, 'utf8');
  const open = /exposeInMainWorld\(\s*'([^']+)'\s*,\s*\{/.exec(source);
  if (!open) {
    throw new Error('exposeInMainWorld not found in preload.js');
  }
  const body = source.slice(open.index + open[0].length);
  const end = body.indexOf('\n});');
  const keys = Array.from(body.slice(0, end).matchAll(/^ {2}(\w+):/gm), (m) => m[1]);
  return { name: open[1], keys };
}

/** Script paths from the <script src> tags of index.html, in document order. */
function readScriptPaths(html) {
  return Array.from(html.matchAll(SCRIPT_SRC_PATTERN), (m) => m[1] ?? m[2])
    .filter((src) => !/^[a-z]+:\/\//i.test(src))
    .map((src) => path.join(RENDERER_DIR, src));
}

/** Fake of the preload bridge: records every call and lets tests answer or emit events. */
function createBridge() {
  const calls = [];
  const answers = new Map();
  const listeners = new Map();
  const api = {};

  for (const name of Object.keys(INVOKE_DEFAULTS)) {
    api[name] = (...args) => {
      calls.push({ name, args });
      const answer = answers.has(name) ? answers.get(name) : INVOKE_DEFAULTS[name];
      try {
        return Promise.resolve(typeof answer === 'function' ? answer(...args) : answer);
      } catch (err) {
        return Promise.reject(err);
      }
    };
  }
  for (const name of SEND_METHODS) {
    api[name] = (...args) => {
      calls.push({ name, args });
    };
  }
  for (const name of EVENT_METHODS) {
    api[name] = (callback) => {
      calls.push({ name, args: [] });
      listeners.set(name, [...(listeners.get(name) || []), callback]);
    };
  }

  return {
    api,
    calls,
    callsTo: (name) => calls.filter((c) => c.name === name).map((c) => c.args),
    /** Replace the answer of an invoke method: a value or a function of the call arguments. */
    answer: (name, value) => answers.set(name, value),
    emit: (name, payload) => (listeners.get(name) || []).forEach((cb) => cb(payload)),
  };
}

const flushMicrotasks = async (rounds = 20) => {
  for (let i = 0; i < rounds; i += 1) {
    await Promise.resolve();
  }
};

function installTimers(win, trackedIds) {
  const wrap = (name, tracks) => {
    win[name] = (...args) => {
      const id = globalThis[name](...args);
      if (tracks) {
        trackedIds.push([name, id]);
      }
      return id;
    };
  };
  wrap('setTimeout', true);
  wrap('setInterval', true);
  wrap('clearTimeout', false);
  wrap('clearInterval', false);
}

/**
 * Loads a clean sidebar page.
 *
 * @param {object} [options] - Optional setup.
 * @param {Record<string, *>} [options.answers] - Initial bridge answers by method name.
 * @param {Record<string, string>} [options.storage] - localStorage entries set before the scripts run.
 * @returns {Promise<{win: Window, document: Document, bridge: object, update: Function, click: Function, dispose: Function}>} The page.
 */
async function loadSidebarPage(options = {}) {
  const contract = readPreloadContract();
  const html = fs.readFileSync(INDEX_HTML, 'utf8');
  const bodyHtml = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)[1].replace(SCRIPT_SRC_PATTERN, '');

  const win = new Window({ url: PAGE_URL });
  const timerIds = [];
  installTimers(win, timerIds);
  win.document.body.innerHTML = bodyHtml;

  const bridge = createBridge();
  for (const [name, value] of Object.entries(options.answers || {})) {
    bridge.answer(name, value);
  }
  win[contract.name] = bridge.api;
  for (const [key, value] of Object.entries(options.storage || {})) {
    win.localStorage.setItem(key, value);
  }

  for (const file of readScriptPaths(html)) {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }).runInContext(win);
  }
  await flushMicrotasks();

  return {
    win,
    document: win.document,
    bridge,
    flush: flushMicrotasks,
    /** Emits an onUpdate payload (defaults filled in) and waits for the microtasks. */
    async update(overrides = {}) {
      bridge.emit('onUpdate', buildUpdate(overrides));
      await flushMicrotasks();
    },
    dispose() {
      for (const [name, id] of timerIds) {
        globalThis[name === 'setTimeout' ? 'clearTimeout' : 'clearInterval'](id);
      }
      win.close();
    },
  };
}

/** A complete onUpdate payload as the main process sends it, with per-test overrides. */
function buildUpdate(overrides = {}) {
  const { tasks = [], ...rest } = overrides;
  return {
    engineResult: { global_score: 0.3, tasks },
    palette: { accent_hex: '#44aa66', label: 'Calm' },
    pinnedTaskIds: [],
    favoriteTaskIds: [],
    clinicalNote: null,
    stressForecast: [],
    syncStatus: null,
    showFirstRunHint: false,
    googleCalendarReady: true,
    ...rest,
  };
}

/** A task as the engine sends it; override only what a test cares about. */
function buildTask(overrides = {}) {
  return {
    id: 'task-1',
    source: 'local',
    title: 'Task',
    urgency_score: 0.5,
    priority: 3,
    due_at: null,
    hours_remaining: null,
    ...overrides,
  };
}

/** Flat reading of the task list: section names as "# name", task cards as their title. */
function outline(document) {
  const rows = [];
  for (const child of document.querySelector('#tasksContainer').children) {
    if (child.classList.contains('section-label')) {
      rows.push('# ' + child.firstChild.textContent);
    } else {
      const title = child.querySelector('.task-title, .quick-add-input');
      if (title && !child.classList.contains('quick-add-form')) {
        rows.push(title.classList.contains('task-title') ? title.textContent : '[edit form]');
      }
    }
  }
  return rows;
}

/** The task card whose title is `title`, or null. */
function findCard(document, title) {
  const el = [...document.querySelectorAll('.task-title')].find((e) => e.textContent === title);
  return el ? el.closest('.task-card') : null;
}

/** Opens the "more actions" menu of a card and presses the entry with the given label. */
function chooseMenuItem(card, label) {
  card.querySelector('.action-menu-wrap > .card-btn').click();
  const item = [...card.querySelectorAll('.action-menu-item')].find((b) => b.textContent === label);
  if (!item) {
    throw new Error('menu item not found: ' + label);
  }
  item.click();
}

module.exports = {
  outline,
  findCard,
  chooseMenuItem,
  loadSidebarPage,
  buildUpdate,
  buildTask,
  createBridge,
  readPreloadContract,
  readScriptPaths,
  INVOKE_DEFAULTS,
  SEND_METHODS,
  EVENT_METHODS,
  INDEX_HTML,
};

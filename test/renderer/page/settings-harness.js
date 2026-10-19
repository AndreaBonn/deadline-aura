'use strict';

/**
 * Full-page harness for the settings window: loads the <body> of renderer/settings.html into a
 * fresh happy-dom Window and runs its page scripts, in <script src> order, inside that window.
 * Same approach as harness.js (sidebar), with the bridge of preload-settings.js.
 *
 * SETTINGS_HARNESS_ROOT (or PAGE_HARNESS_ROOT) points the harness at a copy of renderer/,
 * preload-settings.js and i18n/, so a mutation run can prove a test fails without touching the
 * real files.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Window } = require('happy-dom');

const ROOT =
  process.env.SETTINGS_HARNESS_ROOT ||
  process.env.PAGE_HARNESS_ROOT ||
  path.resolve(__dirname, '../../..');
const RENDERER_DIR = path.join(ROOT, 'renderer');
const SETTINGS_HTML = path.join(RENDERER_DIR, 'settings.html');
const PRELOAD = path.join(ROOT, 'preload-settings.js');
const LOCALE_FILE = path.join(ROOT, 'i18n', 'locales', 'it.json');
const PAGE_URL = 'http://localhost/settings.html';

const clone = (value) => JSON.parse(JSON.stringify(value));

const SCRIPT_SRC_PATTERN =
  /<script\b[^>]*?\s+src\s*=\s*(?:"([^"]*)"|'([^']*)')[^>]*>\s*<\/script>/gi;

/** Bridge methods by how preload-settings.js implements them (invoke vs fire-and-forget). */
const INVOKE_DEFAULTS = {
  getTranslations: () => JSON.parse(fs.readFileSync(LOCALE_FILE, 'utf8')),
  getConfig: () => ({}),
  saveConfig: () => ({ ok: true }),
  getDefaults: () => ({}),
  sourceStatus: () => ({ at: null, sources: [] }),
  authorizeGoogle: () => ({ ok: true }),
  verifyJira: () => ({ ok: true, count: 0 }),
  captureStatus: () => ({ installed: false }),
  captureInstall: () => ({ ok: true }),
  captureUninstall: () => ({ ok: true }),
};
const SEND_METHODS = ['close', 'openLink'];

/** Name of the object exposed on window and its keys, parsed from the preload source. */
function readPreloadContract() {
  const source = fs.readFileSync(PRELOAD, 'utf8');
  const open = /exposeInMainWorld\(\s*'([^']+)'\s*,\s*\{/.exec(source);
  if (!open) {
    throw new Error('exposeInMainWorld not found in preload-settings.js');
  }
  const body = source.slice(open.index + open[0].length);
  const end = body.indexOf('\n});');
  const keys = Array.from(body.slice(0, end).matchAll(/^ {2}(\w+):/gm), (m) => m[1]);
  return { name: open[1], keys };
}

/** Script paths from the <script src> tags of settings.html, in document order. */
function readScriptPaths(html) {
  return Array.from(html.matchAll(SCRIPT_SRC_PATTERN), (m) => m[1] ?? m[2]).map((src) =>
    path.join(RENDERER_DIR, src),
  );
}

/** Fake of the settings bridge: records every call and lets tests answer. */
function createBridge() {
  const calls = [];
  const answers = new Map();
  const api = {};
  for (const name of Object.keys(INVOKE_DEFAULTS)) {
    api[name] = (...args) => {
      calls.push({ name, args: clone(args) });
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
      calls.push({ name, args: clone(args) });
    };
  }
  return {
    api,
    calls,
    callsTo: (name) => calls.filter((c) => c.name === name).map((c) => c.args),
    /** Replace the answer of an invoke method: a value or a function of the call arguments. */
    answer: (name, value) => answers.set(name, value),
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
 * Loads a clean settings page.
 *
 * @param {object} [options] - Optional setup.
 * @param {object} [options.config] - What bridge.getConfig() returns.
 * @param {object} [options.defaults] - What bridge.getDefaults() returns.
 * @param {Record<string, *>} [options.answers] - Other initial bridge answers by method name.
 * @returns {Promise<object>} The page: win, document, bridge, helpers, dispose().
 */
async function loadSettingsPage(options = {}) {
  const contract = readPreloadContract();
  const html = fs.readFileSync(SETTINGS_HTML, 'utf8');
  const bodyHtml = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)[1].replace(SCRIPT_SRC_PATTERN, '');

  const win = new Window({ url: PAGE_URL });
  const timerIds = [];
  installTimers(win, timerIds);
  win.document.body.innerHTML = bodyHtml;

  const bridge = createBridge();
  if (options.config) {
    bridge.answer('getConfig', () => clone(options.config));
  }
  if (options.defaults) {
    bridge.answer('getDefaults', () => clone(options.defaults));
  }
  for (const [name, value] of Object.entries(options.answers || {})) {
    bridge.answer(name, value);
  }
  win[contract.name] = bridge.api;

  for (const file of readScriptPaths(html)) {
    new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }).runInContext(win);
  }
  await flushMicrotasks();

  const { document } = win;
  const page = {
    win,
    document,
    bridge,
    flush: flushMicrotasks,
    /** Waits for the zero-delay timers the page queues after events, then microtasks. */
    async settle() {
      await new Promise((resolve) => globalThis.setTimeout(resolve, 5));
      await flushMicrotasks();
    },
    tab: (id) => document.querySelector(`.nav-item[data-tab="${id}"]`),
    async openTab(id) {
      page.tab(id).click();
      await page.settle();
    },
    /** Sets a form control the way a user would and fires the events the page listens to. */
    async edit(el, value) {
      if (el.type === 'checkbox') {
        el.checked = value;
      } else {
        el.value = value;
      }
      el.dispatchEvent(new win.Event('input', { bubbles: true }));
      el.dispatchEvent(new win.Event('change', { bubbles: true }));
      await page.settle();
    },
    async click(el) {
      el.click();
      await page.settle();
    },
    dispose() {
      for (const [name, id] of timerIds) {
        globalThis[name === 'setTimeout' ? 'clearTimeout' : 'clearInterval'](id);
      }
      win.close();
    },
  };
  return page;
}

/** A field row of the content area whose label is `label`: its control and hint. */
function findField(document, label) {
  const row = [...document.querySelectorAll('#settingsContent .field')].find((f) => {
    const l = f.querySelector('.field-label');
    return l && l.textContent.trim() === label;
  });
  return row || null;
}

/** The field group whose title is `title`, or null. */
function findGroup(document, title) {
  const group = [...document.querySelectorAll('#settingsContent .field-group')].find((g) => {
    const h = g.querySelector('.field-group-title');
    return h && h.textContent === title;
  });
  return group || null;
}

module.exports = {
  clone,
  loadSettingsPage,
  findField,
  findGroup,
  createBridge,
  readPreloadContract,
  readScriptPaths,
  INVOKE_DEFAULTS,
  SEND_METHODS,
  SETTINGS_HTML,
};

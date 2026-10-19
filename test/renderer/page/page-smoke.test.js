// @vitest-environment happy-dom
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  loadSidebarPage,
  readPreloadContract,
  readScriptPaths,
  INVOKE_DEFAULTS,
  SEND_METHODS,
  EVENT_METHODS,
  INDEX_HTML,
} = require('./harness');

describe('bridge fake contract', () => {
  it('exposes exactly the keys that preload.js exposes, under the same name', () => {
    const contract = readPreloadContract();
    const fakeKeys = [...Object.keys(INVOKE_DEFAULTS), ...SEND_METHODS, ...EVENT_METHODS];

    expect(contract.name).toBe('deadlineAura');
    expect(contract.keys.length).toBeGreaterThan(20);
    expect([...fakeKeys].sort()).toEqual([...contract.keys].sort());
  });

  it('reads the scripts from index.html in tag order, all existing', () => {
    const paths = readScriptPaths(fs.readFileSync(INDEX_HTML, 'utf8'));

    expect(paths.map((p) => path.basename(p))[0]).toBe('i18n-renderer.js');
    expect(paths.map((p) => path.basename(p)).at(-1)).toBe('sidebar.js');
    for (const p of paths) {
      expect(fs.existsSync(p)).toBe(true);
    }
  });
});

describe('sidebar page smoke', () => {
  let page;
  afterEach(() => page.dispose());

  it('boots, translates the static DOM and registers on the bridge', async () => {
    page = await loadSidebarPage();

    expect(page.document.querySelector('#btnSync')).not.toBeNull();
    // The HTML says "Layout"; the Italian translation from i18n/locales/it.json replaces it.
    expect(page.document.querySelector('#btnLayout').textContent).toBe('Sposta post-it');
    expect(page.bridge.callsTo('onUpdate')).toHaveLength(1);
    expect(page.bridge.callsTo('getTranslations')).toHaveLength(1);
    expect(page.document.querySelector('#clock').textContent).toMatch(/^\d\d:\d\d$/);
  });

  it('renders the tasks pushed by onUpdate', async () => {
    page = await loadSidebarPage();
    await page.update({
      tasks: [{ id: 'a', source: 'local', title: 'Pay rent', urgency_score: 0.4, priority: 2 }],
    });

    const titles = [...page.document.querySelectorAll('.task-title')].map((e) => e.textContent);
    expect(titles).toEqual(['Pay rent']);
  });
});

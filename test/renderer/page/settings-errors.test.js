// @vitest-environment happy-dom
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DEFAULTS } = require('../../../config/defaults');
const { clone, loadSettingsPage } = require('./settings-harness');

const S = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../i18n/locales/it.json'), 'utf8'),
).settings;

let page;
afterEach(() => {
  page?.dispose();
  page = undefined;
});

const $ = (selector) => page.document.querySelector(selector);
const feedback = () => $('#saveFeedback');
const dirtyShown = () => !$('#dirtyIndicator').hidden;
const widthInput = () =>
  [...page.document.querySelectorAll('#settingsContent .field')]
    .find((f) => f.querySelector('.field-label')?.textContent.trim() === S.width)
    .querySelector('input');

async function loadDirtyPage(answers = {}) {
  page = await loadSettingsPage({ config: clone(DEFAULTS), defaults: DEFAULTS, answers });
  await page.openTab('sidebar');
  await page.edit(widthInput(), '300');
  expect(dirtyShown()).toBe(true);
  return vi.spyOn(page.win.console, 'error').mockImplementation(() => {});
}

describe('settings page: saving when the IPC call rejects', () => {
  it('shows the error, logs it and keeps the unsaved-changes indicator', async () => {
    const log = await loadDirtyPage({
      saveConfig: () => {
        throw new Error('ipc down');
      },
    });

    await page.click($('#btnSave'));

    expect(feedback().textContent).toBe(S.action_failed);
    expect(feedback().classList.contains('save-feedback--error')).toBe(true);
    expect(dirtyShown()).toBe(true);
    expect(log).toHaveBeenCalledWith('settings save failed:', 'ipc down');
  });

  it('keeps the window open when save-and-close hits a rejection', async () => {
    await loadDirtyPage({
      saveConfig: () => {
        throw new Error('ipc down');
      },
    });

    await page.click($('#btnClose'));
    await page.click($('#btnSaveAndClose'));

    expect(feedback().textContent).toBe(S.action_failed);
    expect(page.bridge.callsTo('close')).toEqual([]);
  });

  it('a later successful save clears the error and the indicator', async () => {
    await loadDirtyPage({
      saveConfig: () => {
        throw new Error('ipc down');
      },
    });
    await page.click($('#btnSave'));
    page.bridge.answer('saveConfig', { ok: true });

    await page.click($('#btnSave'));

    expect(feedback().textContent).toBe(S.saved);
    expect(feedback().classList.contains('save-feedback--error')).toBe(false);
    expect(dirtyShown()).toBe(false);
  });
});

describe('settings page: start-up when the IPC calls reject', () => {
  // The page logs on its own window console, which exists only after the load: the config is
  // held back until the spy is installed, then released as a failure or as a success.
  async function loadWithHeldConfig() {
    let release;
    const held = new Promise((resolve, reject) => (release = { resolve, reject }));
    page = await loadSettingsPage({ defaults: DEFAULTS, answers: { getConfig: () => held } });
    const log = vi.spyOn(page.win.console, 'error').mockImplementation(() => {});
    return { log, release };
  }

  it('shows the error and logs it when the config cannot be read', async () => {
    const { log, release } = await loadWithHeldConfig();
    release.reject(new Error('ipc down'));
    await page.settle();

    expect(feedback().textContent).toBe(S.action_failed);
    expect(feedback().classList.contains('save-feedback--error')).toBe(true);
    expect(log).toHaveBeenCalledWith('settings init failed:', 'ipc down');
  });

  it('shows no error and logs nothing when the config is read', async () => {
    const { log, release } = await loadWithHeldConfig();
    release.resolve(clone(DEFAULTS));
    await page.settle();

    expect(page.document.querySelectorAll('#settingsContent .field').length).toBeGreaterThan(0);
    expect(feedback().textContent).toBe('');
    expect(feedback().classList.contains('save-feedback--error')).toBe(false);
    expect(log).not.toHaveBeenCalled();
  });
});

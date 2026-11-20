// @vitest-environment happy-dom
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DEFAULTS } = require('../../../config/defaults');
const { clone, loadSettingsPage, findField } = require('./settings-harness');

const S = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../i18n/locales/it.json'), 'utf8'),
).settings;

let page;
afterEach(() => {
  page?.dispose();
  page = undefined;
});

async function loadWallpaper(mode, answers = {}) {
  const config = clone(DEFAULTS);
  config.wallpaper.background_mode = mode;
  config.wallpaper.custom_background = 'old.png';
  page = await loadSettingsPage({ config, defaults: DEFAULTS, answers });
  await page.openTab('wallpaper');
}

const modeSelect = () => findField(page.document, S.background_mode).querySelector('select');
const imageField = () => findField(page.document, S.background_image);
const pickButton = () => imageField()?.querySelector('button');
const statusText = () => imageField().querySelector('.background-status').textContent;
const errorText = () => imageField().querySelector('.background-error').textContent;
const lastSaved = () => page.bridge.callsTo('saveConfig').at(-1)[0];
const save = () => page.click(page.document.querySelector('#btnSave'));

describe('settings page: custom background image', () => {
  it('shows the pick button and the status in custom mode, not in dynamic mode', async () => {
    await loadWallpaper('dynamic');
    expect(imageField()).toBeNull();
    await page.edit(modeSelect(), 'custom');
    expect(pickButton().textContent).toBe(S.background_pick);
    expect(statusText()).toContain(S.background_status_none);
  });

  it('shows the fallback text when the stored image is missing', async () => {
    await loadWallpaper('custom', { backgroundStatus: { state: 'missing', file: 'old.png' } });
    expect(statusText()).toContain(S.background_status_missing);
    expect(statusText()).toContain(S.background_fallback);
  });

  it('updates the status on a good pick and saves the new name with the next Save', async () => {
    await loadWallpaper('custom', {
      pickBackground: { ok: true, file: 'custom-background.jpg', width: 3840, height: 2160 },
    });
    await page.click(pickButton());
    expect(statusText()).toBe('custom-background.jpg, 3840 × 2160 px');
    await page.edit(modeSelect(), 'gradient');
    await save();
    expect(lastSaved().wallpaper.custom_background).toBe('custom-background.jpg');
  });

  it('shows a translated error on a failed pick and keeps the stored name', async () => {
    await loadWallpaper('custom', { pickBackground: { ok: false, error: 'TOO_LARGE' } });
    await page.click(pickButton());
    expect(errorText()).toBe(S.background_error_TOO_LARGE);
    expect(errorText()).toContain('25 MB');
    await page.edit(modeSelect(), 'gradient');
    await save();
    expect(lastSaved().wallpaper.custom_background).toBe('old.png');
  });

  it('shows no message when the dialog is cancelled', async () => {
    await loadWallpaper('custom', { pickBackground: { ok: false, error: 'CANCELLED' } });
    await page.click(pickButton());
    expect(errorText()).toBe('');
    expect(page.bridge.callsTo('pickBackground')).toHaveLength(1);
  });
});

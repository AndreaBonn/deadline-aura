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

const dirtyShown = () => !page.document.querySelector('#dirtyIndicator').hidden;
const widthInput = () =>
  [...page.document.querySelectorAll('#settingsContent .field')]
    .find((f) => f.querySelector('.field-label')?.textContent.trim() === S.width)
    .querySelector('input');

describe('settings page: blocks filled in by a tab are never unsaved changes', () => {
  it('stays clean when an edit is undone and a later tab fills a missing block', async () => {
    const config = clone(DEFAULTS);
    delete config.meeting_dock;
    page = await loadSettingsPage({ config, defaults: DEFAULTS });
    await page.openTab('sidebar');
    await page.edit(widthInput(), '300');
    await page.edit(widthInput(), String(DEFAULTS.sidebar.width));

    await page.openTab('notifiche');

    expect(dirtyShown()).toBe(false);
  });

  it('still shows a real edit made before the tab that fills the block', async () => {
    const config = clone(DEFAULTS);
    delete config.meeting_dock;
    page = await loadSettingsPage({ config, defaults: DEFAULTS });
    await page.openTab('sidebar');
    await page.edit(widthInput(), '300');

    await page.openTab('notifiche');

    expect(dirtyShown()).toBe(true);
  });
});

describe('settings page: a key created by an edit stays an unsaved change', () => {
  const IT = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../../i18n/locales/it.json'), 'utf8'),
  );
  const content = () => page.document.querySelector('#settingsContent');
  const dayCell = (day) =>
    [
      ...content().querySelector('.variable-month-grid').querySelectorAll('.variable-grid-cell'),
    ].find((c) => c.querySelector('.variable-grid-day-num')?.textContent === String(day));
  const editorButton = (label) =>
    [...content().querySelector('.day-shift-editor').querySelectorAll('button')].find(
      (b) => b.textContent === label,
    );

  it('keeps the first shift of an empty month unsaved after switching tab', async () => {
    const config = clone(DEFAULTS);
    config.work_shift.mode = 'variable';
    config.work_shift.variable = { months: {} };
    page = await loadSettingsPage({ config, defaults: DEFAULTS });
    await page.openTab('turno');
    await page.click(dayCell(15));
    await page.click(editorButton('+'));
    await page.click(editorButton(IT.common.save));
    expect(dirtyShown()).toBe(true);

    await page.openTab('generale');

    expect(dirtyShown()).toBe(true);
  });
});

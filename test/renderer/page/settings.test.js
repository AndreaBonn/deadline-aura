// @vitest-environment happy-dom
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DEFAULTS } = require('../../../config/defaults');
const {
  clone,
  loadSettingsPage,
  findField,
  findGroup,
  readPreloadContract,
  INVOKE_DEFAULTS,
  SEND_METHODS,
} = require('./settings-harness');

const IT = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../i18n/locales/it.json'), 'utf8'),
);
const S = IT.settings;

/** The config the main process would hand over: defaults, Google/Jira off and not set up. */
function startConfig(patch = {}) {
  const config = clone(DEFAULTS);
  config.sources.google_calendar.enabled = false;
  config.sources.google_calendar.oauth = { client_id: '', client_secret: '' };
  config.sources.jira.enabled = false;
  return Object.assign(config, patch);
}

let page;
afterEach(() => {
  page?.dispose();
  page = undefined;
});

async function load(config = startConfig(), options = {}) {
  page = await loadSettingsPage({ config, defaults: DEFAULTS, ...options });
  return page;
}

const content = () => page.document.querySelector('#settingsContent');
const dirtyShown = () => !page.document.querySelector('#dirtyIndicator').hidden;
const feedback = () => page.document.querySelector('#saveFeedback');
const groupTitles = () =>
  [...content().querySelectorAll('.field-group-title')].map((e) => e.textContent);
/** The control (input/select) of the field `label`, optionally inside a group. */
const control = (label, groupTitle) => {
  const scope = groupTitle ? findGroup(page.document, groupTitle) : content();
  const row = [...scope.querySelectorAll('.field')].find(
    (f) => f.querySelector('.field-label')?.textContent.trim() === label,
  );
  return row.querySelector('input, select');
};
const savedPayloads = () => page.bridge.callsTo('saveConfig').map((args) => args[0]);

describe('bridge fake contract', () => {
  it('exposes exactly the keys that preload-settings.js exposes, under the same name', () => {
    const contract = readPreloadContract();
    const fakeKeys = [...Object.keys(INVOKE_DEFAULTS), ...SEND_METHODS];

    expect(contract.name).toBe('settingsApi');
    expect(contract.keys).toHaveLength(12);
    expect([...fakeKeys].sort()).toEqual([...contract.keys].sort());
  });
});

describe('settings page: tab navigation', () => {
  it('opens on the connections tab, translated, with only that tab active', async () => {
    await load();

    const active = [...page.document.querySelectorAll('.nav-item.active')];
    expect(active.map((b) => b.dataset.tab)).toEqual(['sorgenti']);
    expect(active[0].textContent).toBe(S.tabs.sources);
    expect(active[0].getAttribute('aria-current')).toBe('page');
    expect(groupTitles()).toEqual([
      S.status_title,
      IT.sidebar.google_calendar,
      IT.sidebar.outlook,
      IT.sidebar.jira,
    ]);
  });

  it('shows the content of the clicked tab and moves the active mark to it', async () => {
    await load();

    await page.openTab('sidebar');

    expect(groupTitles()).toEqual([S.tabs.sidebar]);
    expect(findField(page.document, S.width)).not.toBeNull();
    expect(findField(page.document, S.language)).toBeNull();
    const active = [...page.document.querySelectorAll('.nav-item.active')];
    expect(active.map((b) => b.dataset.tab)).toEqual(['sidebar']);
    expect(page.tab('sorgenti').getAttribute('aria-current')).toBe('false');
    expect(page.tab('sidebar').getAttribute('aria-current')).toBe('page');
  });

  it('renders the saved values in the fields of the tab', async () => {
    await load();

    await page.openTab('sidebar');

    expect(control(S.width).value).toBe('260');
    expect(control(S.position).value).toBe('right');
  });

  it('shows a different content for every one of the ten tabs', async () => {
    await load();
    const seen = new Set();

    for (const btn of page.document.querySelectorAll('.nav-item')) {
      await page.openTab(btn.dataset.tab);
      expect(content().children.length).toBeGreaterThan(0);
      seen.add(groupTitles().join('|'));
    }

    expect(seen.size).toBe(10);
  });
});

describe('settings page: unsaved changes indicator', () => {
  it('is hidden on load and while only navigating between tabs', async () => {
    await load();
    expect(dirtyShown()).toBe(false);

    await page.openTab('ai');
    await page.openTab('turno');

    expect(dirtyShown()).toBe(false);
  });

  it('appears after editing a value and disappears after a successful save', async () => {
    await load();
    await page.openTab('sidebar');

    await page.edit(control(S.width), '300');
    expect(dirtyShown()).toBe(true);

    await page.click(page.document.querySelector('#btnSave'));

    expect(dirtyShown()).toBe(false);
    expect(feedback().textContent).toBe(S.saved);
    expect(feedback().classList.contains('save-feedback--error')).toBe(false);
  });

  it('disappears when the edit is undone back to the saved value', async () => {
    await load();
    await page.openTab('sidebar');

    await page.edit(control(S.width), '300');
    await page.edit(control(S.width), '260');

    expect(dirtyShown()).toBe(false);
  });

  it('stays visible when the save is refused', async () => {
    await load();
    page.bridge.answer('saveConfig', { ok: false, issues: [] });
    await page.openTab('sidebar');
    await page.edit(control(S.width), '300');

    await page.click(page.document.querySelector('#btnSave'));

    expect(dirtyShown()).toBe(true);
  });

  it('is not triggered by controls that only reveal or open things', async () => {
    await load();
    await page.openTab('ai');

    await page.click(content().querySelector('.secret-toggle'));
    await page.click(content().querySelector('summary'));

    expect(dirtyShown()).toBe(false);
  });

  it('does not reappear when a later tab fills a missing block after a save', async () => {
    const config = startConfig();
    delete config.meeting_dock;
    await load(config);
    await page.openTab('sidebar');
    await page.edit(control(S.width), '300');
    await page.click(page.document.querySelector('#btnSave'));

    await page.openTab('notifiche');

    expect(dirtyShown()).toBe(false);
  });

  it('clears the "saved" message after two seconds', async () => {
    await load();
    await page.openTab('sidebar');
    await page.edit(control(S.width), '300');
    await page.click(page.document.querySelector('#btnSave'));
    expect(feedback().textContent).toBe(S.saved);

    await new Promise((resolve) => globalThis.setTimeout(resolve, 2100));

    expect(feedback().textContent).toBe('');
  });
});

describe('settings page: save', () => {
  it('sends the whole config with exactly the edited values, numbers as numbers', async () => {
    await load();
    await page.openTab('sidebar');

    await page.edit(control(S.position), 'left');
    await page.edit(control(S.width), '320');
    await page.click(page.document.querySelector('#btnSave'));

    const expected = startConfig();
    expected.sidebar.position = 'left';
    expected.sidebar.width = 320;
    expect(savedPayloads()).toEqual([expected]);
    expect(typeof savedPayloads()[0].sidebar.width).toBe('number');
  });

  it('keeps edits made on different tabs in the same payload', async () => {
    await load();
    await page.openTab('sidebar');
    await page.edit(control(S.width), '350');
    await page.openTab('notifiche');
    await page.edit(control(S.notifications_enabled), false);

    await page.click(page.document.querySelector('#btnSave'));

    const expected = startConfig();
    expected.sidebar.width = 350;
    expected.notifications.enabled = false;
    expect(savedPayloads()).toEqual([expected]);
  });

  it('fills missing blocks without marking the page as modified', async () => {
    const config = startConfig();
    delete config.meeting_dock;
    await load(config);

    await page.openTab('notifiche');

    expect(dirtyShown()).toBe(false);
    await page.click(page.document.querySelector('#btnSave'));
    expect(savedPayloads()[0].meeting_dock).toEqual({ enabled: true, lookahead_minutes: 10 });
  });
});

describe('settings page: save error', () => {
  it('jumps to the tab owning the invalid field and explains what to change', async () => {
    await load();
    await page.openTab('generale');
    page.bridge.answer('saveConfig', {
      ok: false,
      issues: [{ path: 'sidebar.width', code: 'too_big', maximum: 400 }],
    });
    await page.edit(control(S.lookahead_window), '100');

    await page.click(page.document.querySelector('#btnSave'));

    expect(page.document.querySelector('.nav-item.active').dataset.tab).toBe('sidebar');
    expect(groupTitles()).toEqual([S.tabs.sidebar]);
    expect(feedback().textContent).toBe(
      `Controlla la scheda «${S.tabs.sidebar}»: Inserisci un valore non superiore a 400.`,
    );
    expect(feedback().classList.contains('save-feedback--error')).toBe(true);
  });

  it('says "not smaller than" for a too_small issue', async () => {
    await load();
    page.bridge.answer('saveConfig', {
      ok: false,
      issues: [{ path: 'ai.recalc_hours', code: 'too_small', minimum: 1 }],
    });

    await page.click(page.document.querySelector('#btnSave'));

    expect(page.document.querySelector('.nav-item.active').dataset.tab).toBe('ai');
    expect(feedback().textContent).toBe(
      `Controlla la scheda «${S.tabs.ai}»: Inserisci un valore non inferiore a 1.`,
    );
  });

  it('stays on the current tab when the invalid field is on it, and the error persists', async () => {
    await load();
    page.bridge.answer('saveConfig', {
      ok: false,
      issues: [{ path: 'sources.jira.jql', code: 'invalid_type' }],
    });

    await page.click(page.document.querySelector('#btnSave'));
    await new Promise((resolve) => globalThis.setTimeout(resolve, 2100));

    expect(page.document.querySelector('.nav-item.active').dataset.tab).toBe('sorgenti');
    expect(feedback().textContent).toBe(
      `Controlla la scheda «${S.tabs.sources}»: ${S.save_error_generic}`,
    );
  });

  it('sends the AI usage toggle error to the Limiti tab, not to Wallpaper', async () => {
    await load();
    page.bridge.answer('saveConfig', {
      ok: false,
      issues: [{ path: 'wallpaper.show_ai_usage', code: 'invalid_type' }],
    });

    await page.click(page.document.querySelector('#btnSave'));

    expect(page.document.querySelector('.nav-item.active').dataset.tab).toBe('limiti');
    expect(feedback().textContent).toBe(
      `Controlla la scheda «${S.tabs.ai_usage}»: ${S.save_error_generic}`,
    );
  });

  it('names the path when no tab owns it, and stays put', async () => {
    await load();
    await page.openTab('ui');
    page.bridge.answer('saveConfig', {
      ok: false,
      issues: [{ path: 'burnout.stress_threshold', code: 'too_big', maximum: 10 }],
    });

    await page.click(page.document.querySelector('#btnSave'));

    expect(page.document.querySelector('.nav-item.active').dataset.tab).toBe('ui');
    expect(feedback().textContent).toBe(`${S.save_error_generic} (burnout.stress_threshold)`);
  });

  it('shows the generic message when the refusal has no issues', async () => {
    await load();
    page.bridge.answer('saveConfig', { ok: false });

    await page.click(page.document.querySelector('#btnSave'));

    expect(feedback().textContent).toBe(S.save_error_generic);
    expect(feedback().classList.contains('save-feedback--error')).toBe(true);
  });

  it('removes the error style after a later successful save', async () => {
    await load();
    page.bridge.answer('saveConfig', { ok: false });
    await page.click(page.document.querySelector('#btnSave'));
    page.bridge.answer('saveConfig', { ok: true });

    await page.click(page.document.querySelector('#btnSave'));

    expect(feedback().classList.contains('save-feedback--error')).toBe(false);
    expect(feedback().textContent).toBe(S.saved);
  });
});

describe('settings page: closing', () => {
  const dialog = () => page.document.querySelector('#unsavedDialog');
  const dirtyUp = async () => {
    await page.openTab('sidebar');
    await page.edit(control(S.width), '300');
  };

  it('closes straight away when nothing was modified', async () => {
    await load();

    await page.click(page.document.querySelector('#btnClose'));

    expect(page.bridge.callsTo('close')).toHaveLength(1);
    expect(dialog().open).toBe(false);
  });

  it('asks for confirmation instead of closing when there are unsaved changes', async () => {
    await load();
    await dirtyUp();

    await page.click(page.document.querySelector('#btnClose'));

    expect(dialog().open).toBe(true);
    expect(page.bridge.callsTo('close')).toHaveLength(0);
    expect(savedPayloads()).toHaveLength(0);
  });

  it('"keep editing" dismisses the dialog and leaves the changes', async () => {
    await load();
    await dirtyUp();
    await page.click(page.document.querySelector('#btnClose'));

    await page.click(page.document.querySelector('#btnKeepEditing'));

    expect(dialog().open).toBe(false);
    expect(page.bridge.callsTo('close')).toHaveLength(0);
    expect(dirtyShown()).toBe(true);
    expect(control(S.width).value).toBe('300');
  });

  it('"close without saving" closes the window and sends nothing to save', async () => {
    await load();
    await dirtyUp();
    await page.click(page.document.querySelector('#btnClose'));

    await page.click(page.document.querySelector('#btnDiscard'));

    expect(page.bridge.callsTo('close')).toHaveLength(1);
    expect(savedPayloads()).toHaveLength(0);
  });

  it('"save and close" saves the edited config, then closes', async () => {
    await load();
    await dirtyUp();
    await page.click(page.document.querySelector('#btnClose'));

    await page.click(page.document.querySelector('#btnSaveAndClose'));

    const expected = startConfig();
    expected.sidebar.width = 300;
    expect(savedPayloads()).toEqual([expected]);
    expect(page.bridge.callsTo('close')).toHaveLength(1);
    expect(dialog().open).toBe(false);
  });

  it('"save and close" does not close when the save is refused', async () => {
    await load();
    await dirtyUp();
    page.bridge.answer('saveConfig', { ok: false });
    await page.click(page.document.querySelector('#btnClose'));

    await page.click(page.document.querySelector('#btnSaveAndClose'));

    expect(savedPayloads()).toHaveLength(1);
    expect(page.bridge.callsTo('close')).toHaveLength(0);
    expect(feedback().textContent).toBe(S.save_error_generic);
  });

  it('closes without asking after the changes were saved', async () => {
    await load();
    await dirtyUp();
    await page.click(page.document.querySelector('#btnSave'));

    await page.click(page.document.querySelector('#btnClose'));

    expect(page.bridge.callsTo('close')).toHaveLength(1);
    expect(dialog().open).toBe(false);
  });
});

describe('settings page: reset section', () => {
  it('restores the defaults of the current tab only and counts as a modification', async () => {
    await load();
    await page.openTab('sidebar');
    await page.edit(control(S.width), '300');
    await page.openTab('notifiche');
    await page.edit(control(S.cooldown), '99');

    await page.click(page.document.querySelector('#btnReset'));

    expect(control(S.cooldown).value).toBe('30');
    await page.openTab('sidebar');
    expect(control(S.width).value).toBe('300');
    await page.click(page.document.querySelector('#btnSave'));
    const expected = startConfig();
    expected.sidebar.width = 300;
    expect(savedPayloads()).toEqual([expected]);
  });

  it('flags the page as modified when the reset changes a value', async () => {
    const config = startConfig();
    config.sidebar.width = 300;
    await load(config);
    await page.openTab('sidebar');
    expect(dirtyShown()).toBe(false);

    await page.click(page.document.querySelector('#btnReset'));

    expect(control(S.width).value).toBe('260');
    expect(dirtyShown()).toBe(true);
  });
});

describe('settings page: Google Calendar credentials', () => {
  const GOOGLE = IT.sidebar.google_calendar;
  const googleToggle = () => control(IT.common.enabled, GOOGLE);
  const needsSetup = () => content().textContent.includes(S.source_needs_setup);

  it('starts off, with the setup steps visible', async () => {
    await load();

    expect(googleToggle().checked).toBe(false);
    expect(content().querySelector('.setup-steps')).not.toBeNull();
  });

  it('turns the source on once both client id and secret are filled in', async () => {
    await load();

    await page.edit(control(S.google_client_id), 'abc.apps.googleusercontent.com');
    expect(googleToggle().checked).toBe(false);

    await page.edit(control(S.google_client_secret), 's3cret');

    expect(googleToggle().checked).toBe(true);
    expect(content().querySelector('.setup-steps')).toBeNull();
    expect(needsSetup()).toBe(false);
    expect(control(S.google_client_id).value).toBe('abc.apps.googleusercontent.com');
  });

  it('does not turn it on for a secret made of spaces', async () => {
    await load();
    await page.edit(control(S.google_client_id), 'abc');

    await page.edit(control(S.google_client_secret), '   ');

    expect(googleToggle().checked).toBe(false);
  });

  it('saves the credentials together with enabled: true', async () => {
    await load();
    await page.edit(control(S.google_client_id), 'abc');
    await page.edit(control(S.google_client_secret), 's3cret');

    await page.click(page.document.querySelector('#btnSave'));

    const google = savedPayloads()[0].sources.google_calendar;
    expect(google.enabled).toBe(true);
    expect(google.oauth).toEqual({ client_id: 'abc', client_secret: 's3cret' });
  });

  it('warns when the source is switched on by hand without credentials', async () => {
    await load();
    expect(needsSetup()).toBe(false);

    await page.edit(googleToggle(), true);

    expect(needsSetup()).toBe(true);
  });

  it('authorizes only after saving pending edits, and shows the outcome', async () => {
    await load();
    await page.edit(control(S.google_client_id), 'abc');
    await page.edit(control(S.google_client_secret), 's3cret');
    const authorize = [...content().querySelectorAll('button')].find(
      (b) => b.textContent === S.google_authorize_btn,
    );

    await page.click(authorize);

    expect(savedPayloads()).toHaveLength(1);
    expect(page.bridge.callsTo('authorizeGoogle')).toHaveLength(1);
    const names = page.bridge.calls.map((c) => c.name);
    expect(names.indexOf('saveConfig')).toBeLessThan(names.indexOf('authorizeGoogle'));
    expect(content().querySelector('.action-result-text').textContent).toBe(S.google_auth_ok);
    expect(dirtyShown()).toBe(false);
  });

  it('does not authorize when the pending save is refused', async () => {
    await load();
    page.bridge.answer('saveConfig', { ok: false });
    await page.edit(control(S.google_client_id), 'abc');
    const authorize = [...content().querySelectorAll('button')].find(
      (b) => b.textContent === S.google_authorize_btn,
    );

    await page.click(authorize);

    expect(page.bridge.callsTo('authorizeGoogle')).toHaveLength(0);
  });

  it('shows the translated reason when authorization fails', async () => {
    await load();
    page.bridge.answer('authorizeGoogle', { ok: false, error: 'PORT_IN_USE' });
    const authorize = [...content().querySelectorAll('button')].find(
      (b) => b.textContent === S.google_authorize_btn,
    );

    await page.click(authorize);

    const result = content().querySelector('.action-result-text');
    expect(result.textContent).toBe(S.google_auth_port);
    expect(result.classList.contains('action-result-text--error')).toBe(true);
  });
});

describe('settings page: Jira instances', () => {
  const JIRA = IT.sidebar.jira;
  const cards = () => [...content().querySelectorAll('.instance-card')];
  const jiraToggle = () => control(IT.common.enabled, JIRA);
  const addButton = () =>
    [...content().querySelectorAll('button')].find((b) => b.textContent === S.add_instance);

  it('adds an empty instance card with the three fields', async () => {
    await load();
    expect(cards()).toHaveLength(0);

    await page.click(addButton());

    expect(cards()).toHaveLength(1);
    expect(cards()[0].querySelector('.instance-title').textContent).toBe('Istanza 1');
    const inputs = [...cards()[0].querySelectorAll('input')];
    expect(inputs).toHaveLength(3);
    expect(inputs.map((i) => i.value)).toEqual(['', '', '']);
    expect(dirtyShown()).toBe(true);
  });

  it('turns Jira on when an instance is complete, and saves it', async () => {
    await load();
    await page.click(addButton());
    const [domain, email] = cards()[0].querySelectorAll('input');

    await page.edit(domain, 'acme.atlassian.net');
    await page.edit(email, 'me@acme.com');
    expect(jiraToggle().checked).toBe(false);
    await page.edit(cards()[0].querySelectorAll('input')[2], 'tok');

    expect(jiraToggle().checked).toBe(true);
    await page.click(page.document.querySelector('#btnSave'));
    const jira = savedPayloads()[0].sources.jira;
    expect(jira.enabled).toBe(true);
    expect(jira.instances).toEqual([
      { domain: 'acme.atlassian.net', email: 'me@acme.com', api_token: 'tok' },
    ]);
  });

  it('warns about an enabled Jira with no complete instance', async () => {
    await load();

    await page.edit(jiraToggle(), true);

    expect(content().textContent).toContain(S.jira_needs_instance);
    await page.click(addButton());
    expect(content().textContent).toContain(S.jira_needs_instance);
  });

  it('numbers the instances and removes the chosen one', async () => {
    const config = startConfig();
    config.sources.jira.instances = [
      { domain: 'a.net', email: 'a@a.net', api_token: 'ta' },
      { domain: 'b.net', email: 'b@b.net', api_token: 'tb' },
    ];
    await load(config);
    expect(cards().map((c) => c.querySelector('.instance-title').textContent)).toEqual([
      'Istanza 1',
      'Istanza 2',
    ]);

    await page.click(cards()[0].querySelector('.btn--danger'));

    expect(cards()).toHaveLength(1);
    expect(cards()[0].querySelector('input').value).toBe('b.net');
    await page.click(page.document.querySelector('#btnSave'));
    expect(savedPayloads()[0].sources.jira.instances).toEqual([
      { domain: 'b.net', email: 'b@b.net', api_token: 'tb' },
    ]);
  });

  it('removes the second instance and keeps the first', async () => {
    const config = startConfig();
    config.sources.jira.instances = [
      { domain: 'a.net', email: 'a@a.net', api_token: 'ta' },
      { domain: 'b.net', email: 'b@b.net', api_token: 'tb' },
    ];
    await load(config);

    await page.click(cards()[1].querySelector('.btn--danger'));

    expect(cards()).toHaveLength(1);
    expect(cards()[0].querySelector('input').value).toBe('a.net');
  });

  it('verifies the instance by index with the typed values and the current JQL', async () => {
    const config = startConfig();
    config.sources.jira.instances = [
      { domain: 'a.net', email: 'a@a.net', api_token: 'ta' },
      { domain: 'b.net', email: 'b@b.net', api_token: 'tb' },
    ];
    await load(config);
    page.bridge.answer('verifyJira', { ok: true, count: 7 });
    const verify = cards()[1].querySelector('.action-result .btn');

    await page.click(verify);

    expect(page.bridge.callsTo('verifyJira')).toEqual([
      [1, { domain: 'b.net', email: 'b@b.net', api_token: 'tb', jql: DEFAULTS.sources.jira.jql }],
    ]);
    expect(cards()[1].querySelector('.action-result-text').textContent).toBe(
      IT.settings.jira_verify_ok.replace('{n}', '7'),
    );
  });

  it('shows the translated reason when verification fails', async () => {
    const config = startConfig();
    config.sources.jira.instances = [{ domain: 'a.net', email: 'a@a.net', api_token: 'ta' }];
    await load(config);
    page.bridge.answer('verifyJira', { ok: false, error: 'AUTH_FAILED' });

    await page.click(cards()[0].querySelector('.action-result .btn'));

    const result = cards()[0].querySelector('.action-result-text');
    expect(result.textContent).toBe(S.jira_verify_auth);
    expect(result.classList.contains('action-result-text--error')).toBe(true);
  });

  it('puts the default JQL back with the reset link', async () => {
    const config = startConfig();
    config.sources.jira.jql = 'project = X';
    await load(config);
    expect(control(S.jql).value).toBe('project = X');

    await page.click(
      [...content().querySelectorAll('.link-btn')].find((b) => b.textContent === S.jql_reset),
    );

    expect(control(S.jql).value).toBe(DEFAULTS.sources.jira.jql);
  });
});

describe('settings page: work shift on/off', () => {
  const SHIFT = S.work_shift_group;
  const shiftToggle = () => control(S.work_shift_enabled, SHIFT);

  it('shows the whole shift form while the shift is on', async () => {
    await load();

    await page.openTab('turno');

    expect(shiftToggle().checked).toBe(true);
    expect(groupTitles()).toEqual([
      SHIFT,
      S.work_shift_work_days,
      S.work_shift_slots,
      S.work_shift_holidays,
    ]);
  });

  it('hides everything but the switch when turned off, and saves enabled: false', async () => {
    await load();
    await page.openTab('turno');

    await page.edit(shiftToggle(), false);

    expect(groupTitles()).toEqual([SHIFT]);
    expect(content().querySelectorAll('.field')).toHaveLength(1);
    expect(dirtyShown()).toBe(true);
    await page.click(page.document.querySelector('#btnSave'));
    const expected = startConfig();
    expected.work_shift.enabled = false;
    expect(savedPayloads()).toEqual([expected]);
  });

  it('brings the form back when turned on again, keeping the previous schedule', async () => {
    await load();
    await page.openTab('turno');
    await page.edit(shiftToggle(), false);

    await page.edit(shiftToggle(), true);

    expect(groupTitles()).toHaveLength(4);
    expect(dirtyShown()).toBe(false);
  });

  it('starts from the default shift when the config has none', async () => {
    const config = startConfig();
    delete config.work_shift;
    await load(config);

    await page.openTab('turno');
    await page.click(page.document.querySelector('#btnSave'));

    expect(shiftToggle().checked).toBe(true);
    expect(savedPayloads()[0].work_shift).toEqual(DEFAULTS.work_shift);
  });

  it('edits the working days of the regular shift', async () => {
    await load();
    await page.openTab('turno');
    const friday = [...content().querySelectorAll('.checkbox-item')].find(
      (l) => l.textContent === S.work_shift_day_short_5,
    );

    await page.edit(friday.querySelector('input'), false);
    await page.click(page.document.querySelector('#btnSave'));

    expect(savedPayloads()[0].work_shift.regular.work_days).toEqual([1, 2, 3, 4]);
  });
});

describe('settings page: day editor of the variable shift', () => {
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const thisMonth = () => monthKey(new Date());
  const monthKeys = () => {
    const now = new page.win.Date();
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return [key(now), key(new page.win.Date(now.getFullYear(), now.getMonth() + 1, 1))];
  };
  const grids = () => [...content().querySelectorAll('.variable-month-grid')];
  /** The cell with day number `day` in the grid `gridIndex`. */
  const dayCell = (day, gridIndex = 0) =>
    [...grids()[gridIndex].querySelectorAll('.variable-grid-cell')].find(
      (c) => c.querySelector('.variable-grid-day-num')?.textContent === String(day),
    );
  const editor = () => content().querySelector('.day-shift-editor');
  const editorButton = (label) =>
    [...editor().querySelectorAll('button')].find((b) => b.textContent === label);

  async function loadVariable(months = {}) {
    const config = startConfig();
    config.work_shift.mode = 'variable';
    config.work_shift.variable = { months };
    await load(config);
    await page.openTab('turno');
  }

  it('shows this month and the next one, with their days', async () => {
    await loadVariable();

    expect(grids()).toHaveLength(2);
    const [current, next] = monthKeys();
    const days = (i) => grids()[i].querySelectorAll('.variable-grid-day-num').length;
    const daysIn = (key) =>
      new page.win.Date(Number(key.slice(0, 4)), Number(key.slice(5)), 0).getDate();
    expect(days(0)).toBe(daysIn(current));
    expect(days(1)).toBe(daysIn(next));
    expect(editor()).toBeNull();
  });

  it('shows the shift already set on a day as its time range', async () => {
    const current = thisMonth();
    await loadVariable({
      [current]: {
        10: [
          { start: '08:00', end: '12:00' },
          { start: '13:00', end: '17:00' },
        ],
      },
    });

    expect(dayCell(10).classList.contains('has-shift')).toBe(true);
    expect(dayCell(10).querySelector('.variable-grid-slot-info').textContent).toBe(
      '08:00-12:00, 13:00-17:00',
    );
    expect(dayCell(11).classList.contains('has-shift')).toBe(false);
  });

  it('opens the editor of the clicked day, titled day/month, without slots', async () => {
    await loadVariable();
    const [current] = monthKeys();

    await page.click(dayCell(15));

    expect(editor()).not.toBeNull();
    expect(editor().querySelector('.day-shift-editor-title').textContent).toBe(
      `15/${current.slice(5)}`,
    );
    expect(editor().querySelectorAll('.day-shift-slot-row')).toHaveLength(0);
    expect(dirtyShown()).toBe(false);
  });

  it('adds a 09:00-17:00 slot, lets edit the start, and saves it into the config', async () => {
    await loadVariable();
    const [current] = monthKeys();
    await page.click(dayCell(15));

    await page.click(editorButton('+'));
    const [start, end] = editor().querySelectorAll('.day-shift-slot-row input');
    expect([start.value, end.value]).toEqual(['09:00', '17:00']);
    await page.edit(start, '10:30');
    await page.click(editorButton(IT.common.save));

    expect(editor()).toBeNull();
    expect(dayCell(15).classList.contains('has-shift')).toBe(true);
    expect(dayCell(15).querySelector('.variable-grid-slot-info').textContent).toBe('10:30-17:00');
    expect(dirtyShown()).toBe(true);
    await page.click(page.document.querySelector('#btnSave'));
    const months = savedPayloads()[0].work_shift.variable.months;
    expect(months[current]).toEqual({ 15: [{ start: '10:30', end: '17:00' }] });
  });

  it('changes nothing when the editor is cancelled', async () => {
    await loadVariable();
    await page.click(dayCell(15));
    await page.click(editorButton('+'));

    await page.click(editorButton(IT.common.cancel));

    expect(editor()).toBeNull();
    expect(dayCell(15).classList.contains('has-shift')).toBe(false);
    expect(dirtyShown()).toBe(false);
  });

  it('clears the day with the rest button', async () => {
    const current = thisMonth();
    await loadVariable({ [current]: { 12: [{ start: '08:00', end: '12:00' }] } });
    await page.click(dayCell(12));
    expect(editor().querySelectorAll('.day-shift-slot-row')).toHaveLength(1);

    await page.click(editorButton(S.work_shift_no_shift));

    expect(dayCell(12).classList.contains('has-shift')).toBe(false);
    await page.click(page.document.querySelector('#btnSave'));
    expect(savedPayloads()[0].work_shift.variable.months[current]).toEqual({});
  });

  it('removes a slot of an existing day and keeps the others', async () => {
    const current = thisMonth();
    await loadVariable({
      [current]: {
        12: [
          { start: '08:00', end: '12:00' },
          { start: '13:00', end: '17:00' },
        ],
      },
    });
    await page.click(dayCell(12));

    await page.click(editor().querySelector('.day-shift-slot-row .btn--danger'));
    await page.click(editorButton(IT.common.save));

    expect(dayCell(12).querySelector('.variable-grid-slot-info').textContent).toBe('13:00-17:00');
  });

  it('empties a day saved with no slots left', async () => {
    const current = thisMonth();
    await loadVariable({ [current]: { 12: [{ start: '08:00', end: '12:00' }] } });
    await page.click(dayCell(12));

    await page.click(editor().querySelector('.day-shift-slot-row .btn--danger'));
    await page.click(editorButton(IT.common.save));

    expect(dayCell(12).classList.contains('has-shift')).toBe(false);
  });

  it('sets a day of next month under the next month key', async () => {
    await loadVariable();
    const [, next] = monthKeys();
    await page.click(dayCell(3, 1));
    await page.click(editorButton('+'));
    await page.click(editorButton(IT.common.save));

    await page.click(page.document.querySelector('#btnSave'));

    const months = savedPayloads()[0].work_shift.variable.months;
    expect(months[next]).toEqual({ 3: [{ start: '09:00', end: '17:00' }] });
  });

  it('clears the whole month with the clear button', async () => {
    const current = thisMonth();
    await loadVariable({
      [current]: { 2: [{ start: '08:00', end: '12:00' }], 9: [{ start: '08:00', end: '12:00' }] },
    });
    const clear = [...grids()[0].querySelectorAll('button')].find(
      (b) => b.textContent === S.work_shift_clear_month,
    );

    await page.click(clear);

    expect(grids()[0].querySelectorAll('.has-shift')).toHaveLength(0);
    await page.click(page.document.querySelector('#btnSave'));
    expect(savedPayloads()[0].work_shift.variable.months[current]).toEqual({});
  });
});

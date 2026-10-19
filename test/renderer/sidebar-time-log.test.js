// @vitest-environment happy-dom
'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const { Window } = require('happy-dom');

let win;
beforeEach(() => {
  win = new Window();
  win.deadlineAura = {
    listCalendars: vi
      .fn()
      .mockResolvedValue({ ok: true, calendars: [{ id: 'work', summary: 'Work' }] }),
    getDefaultLogCalendar: vi.fn().mockResolvedValue({ ok: true, calendarId: 'work' }),
  };
  vm.runInContext(
    `const sidebarState = { lastTasks: [
    { source: 'jira', title: 'ABC-12 Issue' }, { source: 'local', title: 'Personal' }
  ], cachedCalendars: null };
  function t(key) { return key; }`,
    win,
  );
  for (const file of ['sidebar-utils.js', 'sidebar-form-values.js', 'sidebar-time-log.js']) {
    vm.runInContext(fs.readFileSync('renderer/' + file, 'utf8'), win);
  }
});
afterEach(() => win.close());

const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
};

it('reveals Jira choices and gives the manual key precedence, normalized to uppercase', () => {
  win.changed = vi.fn();
  const picker = vm.runInContext('createJiraKeyPicker({}, window.changed)', win);
  win.document.body.appendChild(picker.element);
  const select = picker.element.querySelector('select');
  const input = picker.element.querySelector('input');
  expect(select.parentElement.hidden).toBe(true);
  expect([...select.options].map((option) => option.value)).toEqual(['', 'ABC-12']);
  picker.element.querySelector('button').click();
  expect(select.parentElement.hidden).toBe(false);
  expect(win.document.activeElement).toBe(select);
  select.value = 'ABC-12';
  select.dispatchEvent(new win.Event('change'));
  expect(win.changed).toHaveBeenLastCalledWith('ABC-12');
  input.value = ' def-34 ';
  input.dispatchEvent(new win.Event('input'));
  expect(picker.getKey()).toBe('DEF-34');
  expect(select.value).toBe('');
  select.value = 'ABC-12';
  select.dispatchEvent(new win.Event('change'));
  expect(input.value).toBe('');
  expect(picker.getKey()).toBe('ABC-12');
});

it('synchronizes duration presets and their accessible pressed state', () => {
  const input = win.document.createElement('input');
  input.value = '60';
  win.duration = input;
  const presets = vm.runInContext('createTimeLogPresets(window.duration)', win);
  expect([...presets.children].map((button) => button.dataset.minutes)).toEqual([
    '15',
    '30',
    '60',
    '90',
  ]);
  expect(presets.querySelector('[aria-pressed="true"]').dataset.minutes).toBe('60');
  presets.children[1].click();
  expect(input.value).toBe('30');
  expect(presets.querySelector('[aria-pressed="true"]').dataset.minutes).toBe('30');
  input.value = '45';
  input.dispatchEvent(new win.Event('input'));
  expect([...presets.children].map((button) => button.getAttribute('aria-pressed'))).toEqual([
    'false',
    'false',
    'false',
    'false',
  ]);
});

it('caches calendar choices and restores the default in each select', async () => {
  const first = vm.runInContext('createTimeLogCalendarSelect()', win);
  await flush();
  const second = vm.runInContext('createTimeLogCalendarSelect()', win);
  await flush();
  expect([...first.options].map((option) => [option.value, option.textContent])).toEqual([
    ['', 'sidebar.select_calendar'],
    ['work', 'Work'],
  ]);
  expect(first.value).toBe('work');
  expect(second.value).toBe('work');
  expect(win.deadlineAura.listCalendars).toHaveBeenCalledOnce();
  expect(win.deadlineAura.getDefaultLogCalendar).toHaveBeenCalledTimes(2);
});

// @vitest-environment happy-dom
'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const { Window } = require('happy-dom');
const { DEFAULTS } = require('../../config/defaults');

const clone = (v) => JSON.parse(JSON.stringify(v));
let win;
let rerenders;
beforeEach(() => {
  win = new Window();
  rerenders = 0;
  win.rerender = () => {
    rerenders += 1;
  };
  vm.runInContext("function t(key) { return key === 'meta.dateLocale' ? 'it-IT' : key; }", win);
  for (const file of [
    'settings-fields.js',
    'settings-helpers.js',
    'settings-shift-fields.js',
    'settings-month-grid.js',
    'settings-tab-shift.js',
  ]) {
    vm.runInContext(fs.readFileSync(`renderer/${file}`, 'utf8'), win);
  }
});
afterEach(() => win.close());

function renderTurno(config) {
  win.ctx = { getConfig: () => config, defaults: DEFAULTS, rerender: win.rerender };
  const groups = vm.runInContext('renderTurno(window.ctx)', win);
  groups.forEach((g) => win.document.body.appendChild(g));
  return groups;
}

const titles = (groups) => groups.map((g) => g.querySelector('.field-group-title')?.textContent);

describe('ensureWorkShift', () => {
  it('fills a missing work_shift from the defaults without sharing the object', () => {
    const config = {};
    renderTurno(config);
    expect(config.work_shift).toEqual(DEFAULTS.work_shift);
    expect(config.work_shift).not.toBe(DEFAULTS.work_shift);
  });
});

describe('renderTurno', () => {
  it('shows only the enable toggle while the shift is disabled', () => {
    const config = clone(DEFAULTS);
    config.work_shift.enabled = false;
    const groups = renderTurno(config);
    expect(titles(groups)).toEqual(['settings.work_shift_group']);
  });

  it('enabling the shift writes the flag and asks for a re-render', () => {
    const config = clone(DEFAULTS);
    config.work_shift.enabled = false;
    const [group] = renderTurno(config);
    const toggle = group.querySelector('input[type="checkbox"]');
    toggle.checked = true;
    toggle.dispatchEvent(new win.Event('change'));
    expect(config.work_shift.enabled).toBe(true);
    expect(rerenders).toBe(1);
  });

  it('regular mode adds work days, slots and holidays groups', () => {
    const config = clone(DEFAULTS);
    config.work_shift.enabled = true;
    config.work_shift.mode = 'regular';
    const groups = renderTurno(config);
    expect(titles(groups)).toEqual([
      'settings.work_shift_group',
      'settings.work_shift_work_days',
      'settings.work_shift_slots',
      'settings.work_shift_holidays',
    ]);
    const days = groups[1].querySelectorAll('input[type="checkbox"]');
    expect(days).toHaveLength(7);
  });

  it('toggling a work day writes the sorted selection', () => {
    const config = clone(DEFAULTS);
    config.work_shift.enabled = true;
    config.work_shift.mode = 'regular';
    config.work_shift.regular.work_days = [1, 2];
    const groups = renderTurno(config);
    const days = groups[1].querySelectorAll('input[type="checkbox"]');
    days[0].checked = true;
    days[0].dispatchEvent(new win.Event('change'));
    expect(config.work_shift.regular.work_days).toEqual([0, 1, 2]);
  });

  it('switching to variable mode writes the mode and asks for a re-render', () => {
    const config = clone(DEFAULTS);
    config.work_shift.enabled = true;
    config.work_shift.mode = 'regular';
    const [group] = renderTurno(config);
    const select = group.querySelector('select');
    select.value = 'variable';
    select.dispatchEvent(new win.Event('change'));
    expect(config.work_shift.mode).toBe('variable');
    expect(rerenders).toBe(1);
  });

  it('variable mode creates empty current and next month entries across a year end', () => {
    vm.runInContext(
      `Date = class extends Date {
        constructor(...args) {
          if (args.length) super(...args);
          else super(2026, 11, 15);
        }
      };`,
      win,
    );
    const config = clone(DEFAULTS);
    config.work_shift.enabled = true;
    config.work_shift.mode = 'variable';
    delete config.work_shift.variable;
    const groups = renderTurno(config);
    expect(titles(groups)).toEqual([
      'settings.work_shift_group',
      'settings.work_shift_mode_variable',
    ]);
    expect(Object.keys(config.work_shift.variable.months)).toEqual(['2026-12', '2027-01']);
    expect(groups[1].querySelector('.field-hint').textContent).toBe(
      'settings.work_shift_variable_hint',
    );
  });
});

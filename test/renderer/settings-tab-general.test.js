// @vitest-environment happy-dom
'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const { Window } = require('happy-dom');
const { DEFAULTS } = require('../../config/defaults');

const clone = (v) => JSON.parse(JSON.stringify(v));
let win;
beforeEach(() => {
  win = new Window();
  vm.runInContext(
    "function t(key, params) { return params ? key + ':' + params.label : key; }",
    win,
  );
  for (const file of ['settings-fields.js', 'settings-tab-general.js']) {
    vm.runInContext(fs.readFileSync(`renderer/${file}`, 'utf8'), win, {
      filename: require('node:path').resolve(`renderer/${file}`),
    });
  }
});
afterEach(() => win.close());

function render(name, config) {
  win.ctx = { getConfig: () => config, defaults: DEFAULTS };
  const groups = vm.runInContext(`${name}(window.ctx)`, win);
  groups.forEach((g) => win.document.body.appendChild(g));
  return groups;
}

const inputs = (group) => [...group.querySelectorAll('.field input[type="number"]')];
function edit(input, value) {
  input.value = String(value);
  input.dispatchEvent(new win.Event('change'));
}

describe('renderGenerale', () => {
  it('shows the sync intervals and writes edits back to the config', () => {
    const config = clone(DEFAULTS);
    const [group] = render('renderGenerale', config);
    const [interval, lookahead] = inputs(group);
    expect([interval.value, lookahead.value]).toEqual(['10', '72']);
    edit(interval, 15);
    edit(lookahead, 100);
    expect(config.sync.data_interval_minutes).toBe(15);
    expect(config.sync.lookahead_hours).toBe(100);
  });

  it('falls back to the default interval when the config has none', () => {
    const config = clone(DEFAULTS);
    config.sync.data_interval_minutes = 0;
    const [group] = render('renderGenerale', config);
    expect(inputs(group)[0].value).toBe('10');
  });
});

describe('renderAvanzate', () => {
  it('renders the k constant and one labelled weight per priority', () => {
    const [group] = render('renderAvanzate', clone(DEFAULTS));
    const labels = [...group.querySelectorAll('.field-label')].map((l) => l.textContent);
    expect(labels).toEqual([
      'settings.k_constant',
      'settings.weight_label:priorities.critical',
      'settings.weight_label:priorities.high',
      'settings.weight_label:priorities.medium',
      'settings.weight_label:priorities.low',
    ]);
    expect(
      inputs(group)
        .slice(1)
        .map((i) => i.value),
    ).toEqual(['2', '1.5', '1', '0.5']);
  });

  it('writes the k constant and a single weight without touching the others', () => {
    const config = clone(DEFAULTS);
    const [group] = render('renderAvanzate', config);
    const all = inputs(group);
    edit(all[0], 0.2);
    edit(all[3], 4);
    expect(config.engine.k_constant).toBe(0.2);
    expect(config.engine.priority_weights).toEqual([2.0, 1.5, 4, 0.5]);
  });
});

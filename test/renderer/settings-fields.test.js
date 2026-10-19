// @vitest-environment happy-dom
'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { Window } = require('happy-dom');
const { DEFAULTS } = require('../../config/defaults');
const { clone, loadSettingsPage } = require('./page/settings-harness');

let win;
beforeEach(() => {
  win = new Window();
  win.changes = [];
  vm.runInContext(
    `function t(key) { return 'T:' + key; }
    const record = (v) => window.changes.push(v);`,
    win,
  );
  vm.runInContext(fs.readFileSync('renderer/settings-fields.js', 'utf8'), win);
});
afterEach(() => win.close());

function build(call) {
  const el = vm.runInContext(call, win);
  win.document.body.appendChild(el);
  return el;
}

const fire = (el, type, init) => el.dispatchEvent(new win.Event(type, init));

describe('settings-fields CommonJS export', () => {
  it('exposes the field builders to Node when module is defined', () => {
    const exported = {};
    const ctx = vm.createContext({ module: { exports: exported }, document: win.document });
    vm.runInContext(fs.readFileSync('renderer/settings-fields.js', 'utf8'), ctx);
    expect(Object.keys(ctx.module.exports).sort()).toEqual(
      [
        'createCheckboxGroup',
        'createField',
        'createFieldGroup',
        'createNumberInput',
        'createPriorityList',
        'createRangeWithValue',
        'createSecretInput',
        'createSelect',
        'createTagInput',
        'createTextInput',
        'createToggle',
      ].sort(),
    );
  });
});

describe('controls', () => {
  it('toggle reports the checked state', () => {
    const toggle = build('createToggle(false, record)');
    const input = toggle.querySelector('input');
    input.checked = true;
    fire(input, 'change');
    expect(win.changes).toEqual([true]);
  });

  it('number input applies bounds and reports a number', () => {
    const input = build('createNumberInput(5, { min: 1, max: 9, step: 2 }, record)');
    expect([input.min, input.max, input.step, input.value]).toEqual(['1', '9', '2', '5']);
    input.value = '7';
    fire(input, 'change');
    expect(win.changes).toEqual([7]);
  });

  it('number input leaves min and max unset when not given', () => {
    const input = build('createNumberInput(5, undefined, record)');
    expect([input.hasAttribute('min'), input.hasAttribute('max'), input.step]).toEqual([
      false,
      false,
      '1',
    ]);
  });

  it('range and number stay in sync and both report', () => {
    const wrap = build('createRangeWithValue(0.5, { min: 0, max: 1 }, record)');
    const [range, num] = wrap.querySelectorAll('input');
    range.value = '0.8';
    fire(range, 'input');
    expect(num.value).toBe('0.8');
    num.value = '0.3';
    fire(num, 'change');
    expect(range.value).toBe('0.3');
    expect(win.changes).toEqual([0.8, 0.3]);
  });

  it('select supports plain and labelled options and reports the value', () => {
    const select = build("createSelect('b', ['a', { value: 'b', label: 'Bee' }], record)");
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([
      ['a', 'a'],
      ['b', 'Bee'],
    ]);
    select.value = 'a';
    fire(select, 'change');
    expect(win.changes).toEqual(['a']);
  });

  it('secret input toggles visibility and reports edits', () => {
    const wrap = build("createSecretInput('k', { placeholder: 'key' }, record)");
    const input = wrap.querySelector('input');
    const toggle = wrap.querySelector('button');
    expect([input.type, input.placeholder, toggle.textContent]).toEqual([
      'password',
      'key',
      'T:settings.secret_show',
    ]);
    toggle.click();
    expect([input.type, toggle.textContent]).toEqual(['text', 'T:settings.secret_hide']);
    toggle.click();
    expect(input.type).toBe('password');
    input.value = 'new';
    fire(input, 'change');
    expect(win.changes).toEqual(['new']);
  });
});

describe('tag input', () => {
  function press(input, key) {
    const event = new win.KeyboardEvent('keydown', { key, cancelable: true });
    input.dispatchEvent(event);
    return event;
  }

  it('adds a trimmed tag on Enter and prevents form submit', () => {
    const tags = build("createTagInput(['a'], {}, record)");
    const input = tags.querySelector('.tag-input');
    input.value = '  b  ';
    expect(press(input, 'Enter').defaultPrevented).toBe(true);
    expect(win.changes).toEqual([['a', 'b']]);
    expect([...tags.querySelectorAll('.tag')].map((t) => t.firstChild.textContent)).toEqual([
      'a',
      'b',
    ]);
  });

  it('ignores blank input and other keys', () => {
    const tags = build('createTagInput([], {}, record)');
    const input = tags.querySelector('.tag-input');
    input.value = '   ';
    press(input, 'Enter');
    input.value = 'x';
    press(input, 'a');
    expect(win.changes).toEqual([]);
  });

  it('removes a tag and uses the translated default placeholder', () => {
    const tags = build("createTagInput(['a', 'b'], {}, record)");
    expect(tags.querySelector('.tag-input').placeholder).toBe('T:settings.tag_add_placeholder');
    tags.querySelector('.tag-remove').click();
    expect(win.changes).toEqual([['b']]);
    expect(tags.querySelectorAll('.tag')).toHaveLength(1);
  });

  it('honours an explicit placeholder', () => {
    const tags = build("createTagInput([], { placeholder: 'ph' }, record)");
    expect(tags.querySelector('.tag-input').placeholder).toBe('ph');
  });
});

describe('priority list', () => {
  const order = (list) =>
    [...list.querySelectorAll('.priority-item span')].map((s) => s.textContent);

  it('numbers items and disables the outer arrows', () => {
    const list = build("createPriorityList(['x', 'y', 'z'], record)");
    expect(order(list)).toEqual(['1. x', '2. y', '3. z']);
    const items = list.querySelectorAll('.priority-item');
    expect(items[0].querySelectorAll('button')[0].disabled).toBe(true);
    expect(items[2].querySelectorAll('button')[1].disabled).toBe(true);
    expect(items[1].querySelectorAll('button')[0].disabled).toBe(false);
  });

  it('moves an item up and down, reporting each order', () => {
    const list = build("createPriorityList(['x', 'y', 'z'], record)");
    list.querySelectorAll('.priority-item')[1].querySelectorAll('button')[0].click();
    expect(order(list)).toEqual(['1. y', '2. x', '3. z']);
    list.querySelectorAll('.priority-item')[1].querySelectorAll('button')[1].click();
    expect(order(list)).toEqual(['1. y', '2. z', '3. x']);
    expect(win.changes).toEqual([
      ['y', 'x', 'z'],
      ['y', 'z', 'x'],
    ]);
  });
});

describe('field and groups', () => {
  it('createField labels the control and adds the hint only when given', () => {
    const control = vm.runInContext("createTextInput('v', {}, record)", win);
    const field = vm.runInContext('createField', win)('Name', control, 'a hint');
    expect(field.querySelector('.field-label').textContent).toBe('Name');
    expect(field.querySelector('.field-hint').textContent).toBe('a hint');
    expect(control.getAttribute('aria-label')).toBe('Name');
    const bare = vm.runInContext('createField', win)(
      'Other',
      vm.runInContext('createToggle(true, record)', win),
    );
    expect(bare.querySelector('.field-hint')).toBeNull();
    expect(bare.querySelector('input').getAttribute('aria-label')).toBe('Other');
  });

  it('createField keeps an existing aria-label', () => {
    const control = vm.runInContext("createTextInput('v', {}, record)", win);
    control.setAttribute('aria-label', 'custom');
    vm.runInContext('createField', win)('Name', control);
    expect(control.getAttribute('aria-label')).toBe('custom');
  });

  it('createFieldGroup renders a title only when given', () => {
    const create = vm.runInContext('createFieldGroup', win);
    expect(create('Title').querySelector('.field-group-title').textContent).toBe('Title');
    expect(create().querySelector('.field-group-title')).toBeNull();
  });
});

describe('checkbox group', () => {
  it('checks the selected options and reports a numerically sorted selection', () => {
    const group = build(
      "createCheckboxGroup([1, 10], [{ value: 1, label: 'Mon' }, { value: 2, label: 'Tue' }, { value: 10, label: 'X' }], record)",
    );
    const boxes = group.querySelectorAll('input');
    expect([...boxes].map((b) => b.checked)).toEqual([true, false, true]);
    boxes[1].checked = true;
    fire(boxes[1], 'change');
    boxes[0].checked = false;
    fire(boxes[0], 'change');
    expect(win.changes).toEqual([
      [1, 2, 10],
      [2, 10],
    ]);
  });
});

describe('tab renderers write to the live config', () => {
  const IT = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../../i18n/locales/it.json'), 'utf8'),
  );
  let page;
  afterEach(() => page?.dispose());

  const widthInput = () =>
    [...page.document.querySelectorAll('#settingsContent .field')]
      .find((f) => f.querySelector('.field-label')?.textContent.trim() === IT.settings.width)
      .querySelector('input');

  it('saves an edit made after a reset on the config the reset produced', async () => {
    const start = clone(DEFAULTS);
    start.sidebar.width = 300;
    page = await loadSettingsPage({ config: start, defaults: DEFAULTS });
    await page.openTab('sidebar');

    await page.click(page.document.querySelector('#btnReset'));
    expect(widthInput().value).toBe(String(DEFAULTS.sidebar.width));
    await page.edit(widthInput(), '320');
    await page.click(page.document.querySelector('#btnSave'));

    const saved = page.bridge.callsTo('saveConfig').map((args) => args[0]);
    expect(saved).toHaveLength(1);
    expect(saved[0].sidebar.width).toBe(320);
    expect(saved[0].sync).toEqual(start.sync);
  });
});

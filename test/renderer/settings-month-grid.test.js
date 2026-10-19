// @vitest-environment happy-dom
'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const { Window } = require('happy-dom');

let win;
function loadWindow({ withT }) {
  win = new Window();
  if (withT) {
    vm.runInContext(
      `function t(key) { return key === 'meta.dateLocale' ? 'it-IT' : 'T:' + key; }`,
      win,
    );
  }
  for (const file of [
    'settings-shift-fields.js',
    'settings-helpers.js',
    'settings-month-grid.js',
  ]) {
    vm.runInContext(fs.readFileSync('renderer/' + file, 'utf8'), win, {
      filename: require('node:path').resolve('renderer/' + file),
    });
  }
}
afterEach(() => win.close());

// February 2026 starts on a Sunday: 6 empty cells, 28 days, 1 trailing empty cell.
const MONTH = '2026-02';

function grid(monthData = {}) {
  win.changes = [];
  win.monthData = monthData;
  const el = vm.runInContext(
    `createVariableMonthGrid('${MONTH}', window.monthData, (v) => window.changes.push(v))`,
    win,
  );
  win.document.body.appendChild(el);
  return el;
}

const dayCells = (g) => [
  ...g.querySelectorAll('.variable-grid-row:not(.variable-grid-header) .variable-grid-cell'),
];
const liveGrid = () => win.document.querySelector('.variable-month-grid');
const type = (input, value) => {
  input.value = value;
  input.dispatchEvent(new win.Event('change'));
};

describe('createVariableMonthGrid layout', () => {
  beforeEach(() => loadWindow({ withT: true }));

  it('shows the localized month title', () => {
    expect(grid().querySelector('.variable-month-header').textContent).toBe('febbraio 2026');
  });

  it('shows seven day headers starting from Monday', () => {
    const headers = grid().querySelectorAll('.variable-grid-day-header');
    expect([...headers].map((h) => h.textContent)).toEqual(
      [1, 2, 3, 4, 5, 6, 0].map((d) => `T:settings.work_shift_day_short_${d}`),
    );
  });

  it('pads the first week and fills 5 rows of 7 cells', () => {
    const g = grid();
    const cells = dayCells(g);
    expect(cells).toHaveLength(35);
    expect(g.querySelectorAll('.variable-grid-row:not(.variable-grid-header)')).toHaveLength(5);
    expect(cells.slice(0, 6).every((c) => c.classList.contains('variable-grid-empty'))).toBe(true);
    expect(cells[6].querySelector('.variable-grid-day-num').textContent).toBe('1');
    expect(cells[34].classList.contains('variable-grid-empty')).toBe(true);
  });

  it('marks days with a shift and lists their slots', () => {
    const cells = dayCells(
      grid({
        3: [
          { start: '08:00', end: '12:00' },
          { start: '13:00', end: '17:00' },
        ],
      }),
    );
    expect(cells[8].classList.contains('has-shift')).toBe(true);
    expect(cells[8].querySelector('.variable-grid-slot-info').textContent).toBe(
      '08:00-12:00, 13:00-17:00',
    );
    expect(cells[9].classList.contains('has-shift')).toBe(false);
  });

  it('falls back to Italian locale and English day names without t', () => {
    loadWindow({ withT: false });
    const g = grid();
    expect(g.querySelector('.variable-month-header').textContent).toBe('febbraio 2026');
    expect(g.querySelector('.variable-grid-day-header').textContent).toBe('Mon');
    expect(g.querySelector('.variable-month-actions button').textContent).toBe('Clear month');
  });
});

describe('clear month', () => {
  beforeEach(() => loadWindow({ withT: true }));

  it('empties the month data, reports it and redraws without shifts', () => {
    const data = { 3: [{ start: '08:00', end: '12:00' }], 9: [{ start: '09:00', end: '13:00' }] };
    const g = grid(data);
    g.querySelector('.variable-month-actions button').click();
    expect(win.changes).toEqual([{}]);
    expect(data).toEqual({});
    expect(liveGrid()).not.toBe(g);
    expect(liveGrid().querySelectorAll('.has-shift')).toHaveLength(0);
  });
});

describe('day shift editor', () => {
  beforeEach(() => loadWindow({ withT: true }));

  const open = (g, dayNumber) => dayCells(g)[5 + dayNumber].click();
  const editor = () => win.document.querySelector('.day-shift-editor');
  const buttons = () => [...editor().querySelectorAll('.day-shift-actions button')];

  it('opens for the clicked day with its slots prefilled', () => {
    const g = grid({ 3: [{ start: '08:00', end: '12:00' }] });
    open(g, 3);
    expect(editor().querySelector('.day-shift-editor-title').textContent).toBe('3/02');
    expect([...editor().querySelectorAll('.day-shift-slot-row input')].map((i) => i.value)).toEqual(
      ['08:00', '12:00'],
    );
  });

  it('replaces a previously open editor instead of stacking', () => {
    const g = grid();
    open(g, 3);
    open(g, 4);
    expect(g.querySelectorAll('.day-shift-editor')).toHaveLength(1);
    expect(editor().querySelector('.day-shift-editor-title').textContent).toBe('4/02');
  });

  it('shows the actions in order Off, Cancel, Save after the slots', () => {
    open(grid(), 3);
    expect(buttons().map((b) => b.textContent)).toEqual([
      'T:settings.work_shift_no_shift',
      'T:common.cancel',
      'T:common.save',
    ]);
    expect(editor().children[1].className).toBe('day-shift-slots');
  });

  it('saves edited and added slots into the month data', () => {
    const data = { 3: [{ start: '08:00', end: '12:00' }] };
    open(grid(data), 3);
    type(editor().querySelectorAll('.day-shift-slot-row input')[1], '12:30');
    editor().querySelector('.day-shift-slots > .btn--secondary').click();
    buttons()[2].click();
    expect(data[3]).toEqual([
      { start: '08:00', end: '12:30' },
      { start: '09:00', end: '17:00' },
    ]);
    expect(win.changes).toEqual([data]);
    expect(editor()).toBeNull();
    expect(dayCells(liveGrid())[8].classList.contains('has-shift')).toBe(true);
  });

  it('saving with no slots clears the day', () => {
    const data = { 3: [{ start: '08:00', end: '12:00' }] };
    open(grid(data), 3);
    editor().querySelector('.day-shift-slot-row .btn--danger').click();
    buttons()[2].click();
    expect(data).toEqual({});
    expect(win.changes).toEqual([{}]);
  });

  it('Off clears the day without saving the draft slots', () => {
    const data = { 3: [{ start: '08:00', end: '12:00' }], 4: [{ start: '09:00', end: '10:00' }] };
    open(grid(data), 3);
    buttons()[0].click();
    expect(data).toEqual({ 4: [{ start: '09:00', end: '10:00' }] });
    expect(win.changes).toHaveLength(1);
  });

  it('Cancel discards edits without reporting', () => {
    const data = { 3: [{ start: '08:00', end: '12:00' }] };
    const g = grid(data);
    open(g, 3);
    type(editor().querySelector('.day-shift-slot-row input'), '06:00');
    buttons()[1].click();
    expect(editor()).toBeNull();
    expect(win.changes).toEqual([]);
    expect(data[3][0].start).toBe('08:00');
    expect(liveGrid()).toBe(g);
  });

  it('falls back to English labels without t', () => {
    loadWindow({ withT: false });
    open(grid(), 3);
    expect(buttons().map((b) => b.textContent)).toEqual(['Off', 'Cancel', 'Save']);
  });
});

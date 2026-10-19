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
      `function t(key, params) { return 'T:' + key + (params ? JSON.stringify(params) : ''); }`,
      win,
    );
  }
  vm.runInContext(fs.readFileSync('renderer/settings-shift-fields.js', 'utf8'), win);
}
afterEach(() => win.close());

function build(call) {
  const el = vm.runInContext(call, win);
  win.document.body.appendChild(el);
  return el;
}

function type(input, value) {
  input.value = value;
  input.dispatchEvent(new win.Event('change'));
}

describe('createDateList', () => {
  beforeEach(() => loadWindow({ withT: true }));

  function dateList(dates) {
    win.changes = [];
    return build(`createDateList(${JSON.stringify(dates)}, (v) => window.changes.push(v))`);
  }

  it('renders one row per date and a translated add button', () => {
    const list = dateList(['2026-12-25', '2026-12-26']);
    expect([...list.querySelectorAll('input')].map((i) => i.value)).toEqual([
      '2026-12-25',
      '2026-12-26',
    ]);
    expect(list.lastElementChild.textContent).toBe('T:settings.work_shift_add_holiday');
  });

  it('reports the full list when a date is edited', () => {
    const list = dateList(['2026-12-25', '2026-12-26']);
    type(list.querySelectorAll('input')[1], '2027-01-06');
    expect(win.changes).toEqual([['2026-12-25', '2027-01-06']]);
  });

  it('removes the clicked row, reports and re-renders', () => {
    const list = dateList(['2026-12-25', '2026-12-26']);
    list.querySelectorAll('.btn--danger')[0].click();
    expect(win.changes).toEqual([['2026-12-26']]);
    expect([...list.querySelectorAll('input')].map((i) => i.value)).toEqual(['2026-12-26']);
  });

  it('adds tomorrow as an ISO date', () => {
    const list = dateList([]);
    const before = new Date();
    list.querySelector('.btn--secondary').click();
    const tomorrow = new Date(before.getFullYear(), before.getMonth(), before.getDate() + 1);
    const iso = [
      tomorrow.getFullYear(),
      String(tomorrow.getMonth() + 1).padStart(2, '0'),
      String(tomorrow.getDate()).padStart(2, '0'),
    ].join('-');
    expect(win.changes).toEqual([[iso]]);
    expect(list.querySelector('input').value).toBe(iso);
  });

  it('does not mutate the array it was given', () => {
    const input = ['2026-12-25'];
    win.changes = [];
    win.input = input;
    build('createDateList(window.input, (v) => window.changes.push(v))')
      .querySelector('.btn--secondary')
      .click();
    expect(input).toEqual(['2026-12-25']);
  });

  it('falls back to English text when t is not defined', () => {
    loadWindow({ withT: false });
    expect(dateList([]).lastElementChild.textContent).toBe('+ Add date');
  });
});

describe('createTimeSlotList', () => {
  beforeEach(() => loadWindow({ withT: true }));

  function slotList(slots) {
    win.changes = [];
    return build(`createTimeSlotList(${JSON.stringify(slots)}, (v) => window.changes.push(v))`);
  }
  const slot = (start, end) => ({ start, end });

  it('renders numbered rows with start and end inputs', () => {
    const list = slotList([slot('08:00', '12:00'), slot('13:00', '17:00')]);
    const rows = [...list.querySelectorAll('.time-slot-row')];
    expect(rows.map((r) => r.querySelector('.time-slot-label').textContent)).toEqual([
      'T:settings.work_shift_slot_n{"n":1}',
      'T:settings.work_shift_slot_n{"n":2}',
    ]);
    expect([...rows[1].querySelectorAll('input')].map((i) => i.value)).toEqual(['13:00', '17:00']);
  });

  it('reports edits of the start and end independently', () => {
    const list = slotList([slot('08:00', '12:00')]);
    const [start, end] = list.querySelectorAll('input');
    type(start, '07:30');
    type(end, '11:45');
    expect(win.changes).toEqual([[slot('07:30', '12:00')], [slot('07:30', '11:45')]]);
  });

  it('disables removal of the last remaining slot', () => {
    const list = slotList([slot('08:00', '12:00')]);
    expect(list.querySelector('.btn--danger').disabled).toBe(true);
  });

  it('removes a slot and re-renders with renumbered labels', () => {
    const list = slotList([slot('08:00', '12:00'), slot('13:00', '17:00')]);
    list.querySelectorAll('.btn--danger')[0].click();
    expect(win.changes).toEqual([[slot('13:00', '17:00')]]);
    expect(list.querySelectorAll('.time-slot-row')).toHaveLength(1);
    expect(list.querySelector('input').value).toBe('13:00');
  });

  it('adds a 09:00-17:00 slot up to a maximum of four', () => {
    const list = slotList([slot('08:00', '12:00')]);
    for (let i = 0; i < 3; i++) {
      list.querySelector('.btn--secondary').click();
    }
    expect(list.querySelectorAll('.time-slot-row')).toHaveLength(4);
    expect(win.changes.at(-1)).toHaveLength(4);
    expect(win.changes.at(-1)[3]).toEqual(slot('09:00', '17:00'));
    expect(list.querySelector('.btn--secondary')).toBeNull();
  });

  it('shows the add button again after removing from a full list', () => {
    const list = slotList([slot('1', '2'), slot('3', '4'), slot('5', '6'), slot('7', '8')]);
    expect(list.querySelector('.btn--secondary')).toBeNull();
    list.querySelectorAll('.btn--danger')[0].click();
    expect(list.querySelector('.btn--secondary')).not.toBeNull();
  });

  it('falls back to English text when t is not defined', () => {
    loadWindow({ withT: false });
    const list = slotList([slot('08:00', '12:00')]);
    expect(list.querySelector('.time-slot-label').textContent).toBe('Slot 1');
    expect(list.querySelector('.btn--secondary').textContent).toBe('+ Add slot');
  });
});

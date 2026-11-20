// @vitest-environment happy-dom
'use strict';

/* global document */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const filename = path.join(__dirname, '../../renderer/shift-countdown.js');
const source = fs.readFileSync(filename, 'utf8');
const loadRenderer = vm.runInThisContext(
  `(function () { ${source}\nreturn { setShiftConfig, updateShiftCountdown }; })`,
  { filename },
);
const { setShiftConfig, updateShiftCountdown } = loadRenderer();

const schedule = {
  enabled: true,
  mode: 'regular',
  regular: { work_days: [1, 2, 3, 4, 5], slots: [{ start: '09:00', end: '17:00' }] },
};
const element = (id) => document.getElementById(id);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-07T10:15:30'));
  vi.stubGlobal('t', (key) => key);
  vi.stubGlobal('_i18nReady', true);
  document.body.innerHTML =
    '<div id="shiftCountdown"><span id="shiftLabel"></span><span id="shiftTime"></span></div>';
  setShiftConfig(schedule);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('updateShiftCountdown', () => {
  it('hides the countdown when disabled and displays it when enabled', () => {
    setShiftConfig({ enabled: false });
    updateShiftCountdown();
    expect(element('shiftCountdown').style.display).toBe('none');
    setShiftConfig(schedule);
    updateShiftCountdown();
    expect(element('shiftCountdown').style.display).toBe('flex');
  });

  it('shows the remaining time during a shift', () => {
    updateShiftCountdown();
    expect(element('shiftCountdown').className).toBe('shift-countdown working');
    expect(element('shiftLabel').textContent).toBe('sidebar.shift_ends');
    expect(element('shiftTime').textContent).toBe('06:44:30');
  });

  it('shows the time until the shift starts', () => {
    vi.setSystemTime(new Date('2026-10-07T07:30:00'));
    updateShiftCountdown();
    expect(element('shiftCountdown').className).toBe('shift-countdown off');
    expect(element('shiftLabel').textContent).toBe('sidebar.shift_starts');
    expect(element('shiftTime').textContent).toBe('01:30:00');
  });

  it('shows the next workday after the last shift', () => {
    vi.setSystemTime(new Date('2026-10-07T18:00:00'));
    updateShiftCountdown();
    expect(element('shiftCountdown').className).toBe('shift-countdown off');
    expect(element('shiftLabel').textContent).toBe('sidebar.shift_starts');
    expect(element('shiftTime').textContent).toBe('15:00:00');
  });

  it('shows off when no workday is available in the next 60 days', () => {
    setShiftConfig({ ...schedule, regular: { ...schedule.regular, work_days: [] } });
    updateShiftCountdown();
    expect(element('shiftCountdown').className).toBe('shift-countdown off');
    expect(element('shiftLabel').textContent).toBe('sidebar.shift_off');
    expect(element('shiftTime').textContent).toBe('--:--');
  });

  it('uses the raw label before translations are ready', () => {
    vi.stubGlobal('_i18nReady', false);
    updateShiftCountdown();
    expect(element('shiftCountdown').className).toBe('shift-countdown working');
    expect(element('shiftLabel').textContent).toBe('shift_ends');
    expect(element('shiftTime').textContent).toBe('06:44:30');
  });

  it('shows the literal Off before translations are ready when no shift is coming', () => {
    vi.stubGlobal('_i18nReady', false);
    setShiftConfig({ ...schedule, regular: { ...schedule.regular, work_days: [] } });
    updateShiftCountdown();
    expect(element('shiftLabel').textContent).toBe('Off');
    expect(element('shiftTime').textContent).toBe('--:--');
  });

  it('shows off when the computed remaining time is exactly zero', () => {
    vi.setSystemTime(new Date('2026-10-07T16:59:00'));
    vi.spyOn(Date.prototype, 'getSeconds').mockReturnValue(60);
    updateShiftCountdown();
    expect(element('shiftCountdown').className).toBe('shift-countdown working');
    expect(element('shiftLabel').textContent).toBe('sidebar.shift_off');
    expect(element('shiftTime').textContent).toBe('--:--');
  });
});

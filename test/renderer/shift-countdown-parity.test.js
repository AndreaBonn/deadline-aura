'use strict';

const core = require('../../core/work-shift');
const renderer = require('../../renderer/shift-countdown');

const REGULAR = {
  enabled: true,
  mode: 'regular',
  regular: {
    work_days: [1, 2, 3, 4, 5],
    holidays: ['2026-10-12'],
    slots: [
      { start: '14:00', end: '18:00' },
      { start: '09:00', end: '12:30' },
    ],
  },
};
const VARIABLE = {
  enabled: true,
  mode: 'variable',
  variable: {
    months: {
      '2026-10': {
        7: REGULAR.regular.slots,
        8: [],
        10: [{ start: '10:00', end: '13:00' }],
      },
    },
  },
};

describe('shift-countdown parity with core/work-shift', () => {
  it.each(['00:00', '00:01', '09:05', '12:30', '23:59'])('parses %s', (time) => {
    const expected = core.parseTime(time);

    const result = renderer.shiftParseTime(time);

    expect(result).toBe(expected);
  });

  describe.each(['2026-01-01T00:00:00', '2024-02-29T12:00:00', '2026-12-31T23:59:59'])(
    'date %s',
    (dateText) => {
      it('formats the local date key', () => {
        const date = new Date(dateText);
        const expected = core.formatDateKey(date);

        const result = renderer.shiftFormatDateKey(date);

        expect(result).toBe(expected);
      });

      it('formats the local month key', () => {
        const date = new Date(dateText);
        const expected = core.formatMonthKey(date);

        const result = renderer.shiftFormatMonthKey(date);

        expect(result).toBe(expected);
      });
    },
  );

  it.each([-1000, 0, 999, 1000, 59999, 60000, 3599999, 3600000, 90061000])(
    'formats %i remaining milliseconds',
    (milliseconds) => {
      const expected = core.formatRemainingMs(milliseconds);

      const result = renderer.shiftFormatRemainingMs(milliseconds);

      expect(result).toBe(expected);
    },
  );

  it.each([
    ['absent config', '2026-10-07', null],
    ['disabled config', '2026-10-07', { ...REGULAR, enabled: false }],
    ['sorted regular slots', '2026-10-07', REGULAR],
    ['weekend', '2026-10-10', REGULAR],
    ['holiday', '2026-10-12', REGULAR],
    ['missing regular schedule', '2026-10-07', { enabled: true, mode: 'regular' }],
    ['sorted variable slots', '2026-10-07', VARIABLE],
    ['empty variable day', '2026-10-08', VARIABLE],
    ['missing variable day', '2026-10-09', VARIABLE],
    ['variable weekend work', '2026-10-10', VARIABLE],
    ['missing variable month', '2026-11-07', VARIABLE],
    ['missing variable schedule', '2026-10-07', { enabled: true, mode: 'variable' }],
  ])('gets slots for %s', (_label, dateText, config) => {
    const date = new Date(`${dateText}T12:00:00`);
    const expected = core.getSlotsForDate(date, config);

    const result = renderer.shiftGetSlotsForDate(date, config);

    expect(result).toEqual(expected);
  });

  it.each([
    ['next weekday at midnight', '2026-10-07T15:42:30', REGULAR],
    ['weekend and holiday skipped', '2026-10-09T15:42:30', REGULAR],
    ['year rollover', '2026-12-31T15:42:30', REGULAR],
    ['next variable day', '2026-10-07T15:42:30', VARIABLE],
    ['no future variable day', '2026-10-10T15:42:30', VARIABLE],
    ['disabled config', '2026-10-07T15:42:30', { enabled: false }],
    ['absent config', '2026-10-07T15:42:30', null],
    [
      'day 60 is included',
      '2026-01-01T15:42:30',
      {
        enabled: true,
        mode: 'variable',
        variable: { months: { '2026-03': { 2: REGULAR.regular.slots } } },
      },
    ],
    [
      'day 61 is excluded',
      '2026-01-01T15:42:30',
      {
        enabled: true,
        mode: 'variable',
        variable: { months: { '2026-03': { 3: REGULAR.regular.slots } } },
      },
    ],
  ])('finds the next work day: %s', (_label, dateText, config) => {
    const date = new Date(dateText);
    const expected = core.findNextWorkDay(date, config);

    const result = renderer.shiftFindNextWorkDay(date, config);

    expect(result).toEqual(expected);
  });
});

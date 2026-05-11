'use strict';

const {
  parseTime,
  formatRemainingMs,
  cleanupPastHolidays,
  formatDateKey,
  formatMonthKey,
  getSlotsForDate,
  getShiftStatus,
  findNextWorkDay,
  cleanupExpiredMonths,
} = require('../../core/work-shift');

describe('parseTime', () => {
  it('parses 09:00 to 540 minutes', () => {
    expect(parseTime('09:00')).toBe(540);
  });

  it('parses 00:00 to 0', () => {
    expect(parseTime('00:00')).toBe(0);
  });

  it('parses 23:59 to 1439', () => {
    expect(parseTime('23:59')).toBe(1439);
  });

  it('parses 14:30 to 870', () => {
    expect(parseTime('14:30')).toBe(870);
  });
});

describe('formatRemainingMs', () => {
  it('formats 0ms as 00:00', () => {
    expect(formatRemainingMs(0)).toBe('00:00');
  });

  it('formats 90 seconds as 01:30', () => {
    expect(formatRemainingMs(90000)).toBe('01:30');
  });

  it('formats 1 hour as 01:00:00', () => {
    expect(formatRemainingMs(3600000)).toBe('01:00:00');
  });

  it('formats negative ms as 00:00', () => {
    expect(formatRemainingMs(-5000)).toBe('00:00');
  });

  it('formats 2h 30m 15s correctly', () => {
    const ms = (2 * 3600 + 30 * 60 + 15) * 1000;
    expect(formatRemainingMs(ms)).toBe('02:30:15');
  });
});

describe('formatDateKey', () => {
  it('formats date as YYYY-MM-DD with zero-padding', () => {
    expect(formatDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('formats december correctly', () => {
    expect(formatDateKey(new Date(2026, 11, 25))).toBe('2026-12-25');
  });
});

describe('formatMonthKey', () => {
  it('formats as YYYY-MM', () => {
    expect(formatMonthKey(new Date(2026, 4, 11))).toBe('2026-05');
  });
});

describe('cleanupPastHolidays', () => {
  const ref = new Date(2026, 4, 11); // 2026-05-11

  it('removes dates before today', () => {
    const holidays = ['2026-05-01', '2026-05-11', '2026-05-20'];
    expect(cleanupPastHolidays(holidays, ref)).toEqual(['2026-05-11', '2026-05-20']);
  });

  it('returns empty array when all past', () => {
    expect(cleanupPastHolidays(['2025-12-25'], ref)).toEqual([]);
  });

  it('keeps all future dates', () => {
    const holidays = ['2026-08-15', '2026-12-25'];
    expect(cleanupPastHolidays(holidays, ref)).toEqual(['2026-08-15', '2026-12-25']);
  });
});

describe('cleanupExpiredMonths', () => {
  const ref = new Date(2026, 4, 11); // 2026-05

  it('removes months before current', () => {
    const months = {
      '2026-03': { '1': [{ start: '09:00', end: '17:00' }] },
      '2026-05': { '11': [{ start: '09:00', end: '17:00' }] },
      '2026-06': { '1': [{ start: '08:00', end: '14:00' }] },
    };
    const result = cleanupExpiredMonths(months, ref);
    expect(Object.keys(result)).toEqual(['2026-05', '2026-06']);
  });

  it('returns empty object when all expired', () => {
    const months = { '2025-12': { '1': [{ start: '09:00', end: '17:00' }] } };
    expect(cleanupExpiredMonths(months, ref)).toEqual({});
  });
});

describe('getSlotsForDate', () => {
  const regularConfig = {
    enabled: true,
    mode: 'regular',
    regular: {
      work_days: [1, 2, 3, 4, 5],
      slots: [
        { start: '09:00', end: '13:00' },
        { start: '14:00', end: '18:00' },
      ],
      holidays: ['2026-05-15'],
    },
    variable: { months: {} },
  };

  it('returns slots for a regular work day (Monday)', () => {
    const monday = new Date(2026, 4, 11); // Monday 2026-05-11
    const slots = getSlotsForDate(monday, regularConfig);
    expect(slots).toEqual([
      { start: 540, end: 780 },
      { start: 840, end: 1080 },
    ]);
  });

  it('returns empty for weekend (Saturday)', () => {
    const saturday = new Date(2026, 4, 16);
    expect(getSlotsForDate(saturday, regularConfig)).toEqual([]);
  });

  it('returns empty for holiday', () => {
    const holiday = new Date(2026, 4, 15); // Thursday, holiday
    expect(getSlotsForDate(holiday, regularConfig)).toEqual([]);
  });

  it('returns empty when disabled', () => {
    const disabled = { ...regularConfig, enabled: false };
    const monday = new Date(2026, 4, 11);
    expect(getSlotsForDate(monday, disabled)).toEqual([]);
  });

  it('returns variable slots for the specific day', () => {
    const variableConfig = {
      enabled: true,
      mode: 'variable',
      regular: regularConfig.regular,
      variable: {
        months: {
          '2026-05': {
            '11': [{ start: '06:00', end: '14:00' }],
            '12': [{ start: '14:00', end: '22:00' }],
          },
        },
      },
    };
    const may11 = new Date(2026, 4, 11);
    expect(getSlotsForDate(may11, variableConfig)).toEqual([{ start: 360, end: 840 }]);
  });

  it('returns empty for variable mode day with no entry', () => {
    const variableConfig = {
      enabled: true,
      mode: 'variable',
      regular: regularConfig.regular,
      variable: { months: { '2026-05': { '12': [{ start: '08:00', end: '16:00' }] } } },
    };
    const may11 = new Date(2026, 4, 11);
    expect(getSlotsForDate(may11, variableConfig)).toEqual([]);
  });
});

describe('getShiftStatus', () => {
  const config = {
    enabled: true,
    mode: 'regular',
    regular: {
      work_days: [1, 2, 3, 4, 5],
      slots: [
        { start: '09:00', end: '13:00' },
        { start: '14:00', end: '18:00' },
      ],
      holidays: [],
    },
    variable: { months: {} },
  };

  it('returns working=true during morning slot', () => {
    const monday10am = new Date(2026, 4, 11, 10, 30, 0);
    const status = getShiftStatus(config, monday10am);
    expect(status.enabled).toBe(true);
    expect(status.working).toBe(true);
    expect(status.label).toBe('shift_ends');
    expect(status.remainingMs).toBeGreaterThan(0);
  });

  it('returns working=false during lunch break with countdown to afternoon slot', () => {
    const monday1pm = new Date(2026, 4, 11, 13, 30, 0);
    const status = getShiftStatus(config, monday1pm);
    expect(status.working).toBe(false);
    expect(status.label).toBe('shift_starts');
    expect(status.remainingMs).toBeGreaterThan(0);
    expect(status.remainingMs).toBeLessThanOrEqual(30 * 60 * 1000);
  });

  it('returns working=true during afternoon slot', () => {
    const monday3pm = new Date(2026, 4, 11, 15, 0, 0);
    const status = getShiftStatus(config, monday3pm);
    expect(status.working).toBe(true);
    expect(status.label).toBe('shift_ends');
  });

  it('returns working=false before first slot with countdown to morning', () => {
    const monday7am = new Date(2026, 4, 11, 7, 0, 0);
    const status = getShiftStatus(config, monday7am);
    expect(status.working).toBe(false);
    expect(status.label).toBe('shift_starts');
    expect(status.remainingMs).toBeGreaterThan(0);
  });

  it('returns working=false after last slot with countdown to next day', () => {
    const monday7pm = new Date(2026, 4, 11, 19, 0, 0);
    const status = getShiftStatus(config, monday7pm);
    expect(status.working).toBe(false);
    expect(status.label).toBe('shift_starts');
    expect(status.remainingMs).toBeGreaterThan(0);
  });

  it('returns working=false on weekend with countdown to Monday', () => {
    const saturday = new Date(2026, 4, 16, 10, 0, 0);
    const status = getShiftStatus(config, saturday);
    expect(status.working).toBe(false);
    expect(status.label).toBe('shift_starts');
    expect(status.remainingMs).toBeGreaterThan(0);
  });

  it('returns disabled when config.enabled is false', () => {
    const disabled = { ...config, enabled: false };
    const status = getShiftStatus(disabled, new Date(2026, 4, 11, 10, 0, 0));
    expect(status.enabled).toBe(false);
  });

  it('returns disabled when config is null', () => {
    const status = getShiftStatus(null);
    expect(status.enabled).toBe(false);
  });

  it('calculates remaining ms accurately at shift boundary', () => {
    const monday12_59 = new Date(2026, 4, 11, 12, 59, 0);
    const status = getShiftStatus(config, monday12_59);
    expect(status.working).toBe(true);
    expect(status.remainingMs).toBeLessThanOrEqual(60 * 1000);
    expect(status.remainingMs).toBeGreaterThan(0);
  });

  it('formats remaining time correctly', () => {
    const monday9am = new Date(2026, 4, 11, 9, 0, 0);
    const status = getShiftStatus(config, monday9am);
    expect(status.formatted).toBe('04:00:00');
  });

  it('returns working=true during variable mode shift', () => {
    const variableConfig = {
      enabled: true,
      mode: 'variable',
      regular: config.regular,
      variable: {
        months: {
          '2026-05': {
            '11': [{ start: '06:00', end: '14:00' }],
          },
        },
      },
    };
    const may11at10 = new Date(2026, 4, 11, 10, 0, 0);
    const status = getShiftStatus(variableConfig, may11at10);
    expect(status.enabled).toBe(true);
    expect(status.working).toBe(true);
    expect(status.label).toBe('shift_ends');
    expect(status.remainingMs).toBeGreaterThan(0);
  });

  it('returns working=false outside variable mode shift', () => {
    const variableConfig = {
      enabled: true,
      mode: 'variable',
      regular: config.regular,
      variable: {
        months: {
          '2026-05': {
            '11': [{ start: '06:00', end: '14:00' }],
          },
        },
      },
    };
    const may11at15 = new Date(2026, 4, 11, 15, 0, 0);
    const status = getShiftStatus(variableConfig, may11at15);
    expect(status.working).toBe(false);
  });
});

describe('findNextWorkDay', () => {
  const config = {
    enabled: true,
    mode: 'regular',
    regular: {
      work_days: [1, 2, 3, 4, 5],
      slots: [{ start: '09:00', end: '17:00' }],
      holidays: [],
    },
    variable: { months: {} },
  };

  it('finds next Monday from Friday', () => {
    const friday = new Date(2026, 4, 15, 18, 0, 0);
    const next = findNextWorkDay(friday, config);
    expect(next).not.toBeNull();
    expect(next.getDay()).toBe(1); // Monday
    expect(next.getDate()).toBe(18);
  });

  it('finds tomorrow from Monday', () => {
    const monday = new Date(2026, 4, 11, 18, 0, 0);
    const next = findNextWorkDay(monday, config);
    expect(next).not.toBeNull();
    expect(next.getDate()).toBe(12); // Tuesday
  });

  it('skips holidays', () => {
    const configWithHoliday = {
      ...config,
      regular: { ...config.regular, holidays: ['2026-05-12'] },
    };
    const monday = new Date(2026, 4, 11, 18, 0, 0);
    const next = findNextWorkDay(monday, configWithHoliday);
    expect(next).not.toBeNull();
    expect(next.getDate()).toBe(13); // Wednesday, skipping Tuesday holiday
  });

  it('returns null when no work days configured', () => {
    const noWorkDays = {
      ...config,
      regular: { ...config.regular, work_days: [] },
    };
    const result = findNextWorkDay(new Date(2026, 4, 11), noWorkDays);
    expect(result).toBeNull();
  });
});

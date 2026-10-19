'use strict';

const {
  readTaskFormValues,
  toDateTimeLocalValue,
  defaultLogStart,
  validateTimeLog,
  priorityOptions,
} = require('../../renderer/sidebar-form-values');

describe('task form values', () => {
  it('trims the title, parses priority and preserves an empty deadline', () => {
    expect(readTaskFormValues({ title: '  Résumé 東京  ', date: '', priority: '3' })).toEqual({
      title: 'Résumé 東京',
      dueAt: null,
      priority: 3,
    });
  });
  it.each(['', '   '])('rejects blank title %j', (title) => {
    expect(readTaskFormValues({ title, date: '', priority: '1' })).toEqual({ error: 'title' });
  });
  it('reads a local deadline at midnight', () => {
    expect(readTaskFormValues({ title: 'Task', date: '2026-10-20T00:00', priority: '1' })).toEqual({
      title: 'Task',
      dueAt: new Date(2026, 9, 20).getTime(),
      priority: 1,
    });
  });
});

describe('local date values', () => {
  it('formats padded local components across midnight and DST transitions', () => {
    for (const [date, expected] of [
      [new Date(2026, 0, 2, 0, 5), '2026-01-02T00:05'],
      [new Date(2026, 2, 8, 3, 5), '2026-03-08T03:05'],
      [new Date(2026, 10, 1, 1, 5), '2026-11-01T01:05'],
    ]) {
      expect(toDateTimeLocalValue(date)).toBe(expected);
    }
  });
  it.each([
    [10, 59, '10:45'],
    [0, 0, '00:00'],
    [23, 59, '23:45'],
    [3, 14, '03:00'],
  ])('rounds %i:%i down without mutating the input', (hour, minute, expected) => {
    const now = new Date(2026, 2, 8, hour, minute, 42, 123);
    const before = now.getTime();
    expect(defaultLogStart(now)).toBe('2026-03-08T' + expected);
    expect(now.getTime()).toBe(before);
  });
});

describe('time log validation', () => {
  const valid = { duration: '60', calendarId: 'work', date: '2026-10-20', time: '00:00' };
  it('returns the calendar payload with an ISO start', () => {
    expect(validateTimeLog(valid)).toEqual({
      duration: 60,
      calendarId: 'work',
      startTime: new Date(2026, 9, 20).toISOString(),
    });
  });
  it.each(['0', '-15', '', 'invalid'])('rejects invalid duration %j first', (duration) => {
    expect(validateTimeLog({ ...valid, duration, calendarId: '' })).toEqual({
      error: 'sidebar.error_duration',
      field: 'duration',
    });
  });
  it('requires a calendar before checking the start', () => {
    expect(validateTimeLog({ ...valid, calendarId: '', date: '' })).toEqual({
      error: 'sidebar.error_calendar',
      field: 'calendar',
    });
  });
  it.each([{ date: '' }, { time: '' }, { date: 'invalid' }, { time: 'invalid' }])(
    'rejects missing or invalid start %j',
    (patch) => {
      expect(validateTimeLog({ ...valid, ...patch })).toEqual({
        error: 'sidebar.error_start',
        field: 'date',
      });
    },
  );
});

describe('priority options', () => {
  it('preselects P3 when adding a task', () => {
    const selected = priorityOptions(null).filter((option) => option.selected);
    expect(selected.map((option) => option.value)).toEqual(['3']);
  });

  it.each([1, 2, 4])("preselects the task's own priority P%i when editing", (priority) => {
    const selected = priorityOptions({ priority }).filter((option) => option.selected);
    expect(selected.map((option) => option.value)).toEqual([String(priority)]);
  });

  it('lists P1 to P4 in order', () => {
    expect(priorityOptions(null).map((option) => option.value)).toEqual(['1', '2', '3', '4']);
  });
});

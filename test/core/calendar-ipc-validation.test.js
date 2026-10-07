'use strict';

const {
  validateCalendarLogTime,
  validateCalendarUpdateEvent,
} = require('../../core/calendar-ipc-validation');

describe('validateCalendarLogTime', () => {
  const validInput = {
    summary: 'Planning',
    startTime: '2026-10-07T10:00:00Z',
    durationMinutes: 30,
  };

  it.each(['', undefined, null, 42, false, {}])('rejects invalid summary %j', (summary) => {
    const result = validateCalendarLogTime({ ...validInput, summary });
    expect(result).toBe('INVALID_SUMMARY');
  });

  it.each([undefined, null, '', false, 0])('rejects absent or falsy startTime %j', (startTime) => {
    const result = validateCalendarLogTime({ ...validInput, startTime });
    expect(result).toBe('INVALID_TIME');
  });

  it.each([0, -1, 0.5, '30', undefined, null])('rejects invalid duration %j', (durationMinutes) => {
    const result = validateCalendarLogTime({ ...validInput, durationMinutes });
    expect(result).toBe('INVALID_TIME');
  });

  it.each([1, 1.5, 30])(
    'accepts a numeric duration of at least one minute: %j',
    (durationMinutes) => {
      const result = validateCalendarLogTime({ ...validInput, durationMinutes });
      expect(result).toBe(null);
    },
  );

  it('preserves nonempty whitespace summaries without trimming', () => {
    const result = validateCalendarLogTime({ ...validInput, summary: ' ' });
    expect(result).toBe(null);
  });

  it('reports invalid summary before invalid time', () => {
    const result = validateCalendarLogTime({
      summary: '',
      startTime: undefined,
      durationMinutes: 0,
    });
    expect(result).toBe('INVALID_SUMMARY');
  });
});

describe('validateCalendarUpdateEvent', () => {
  const validInput = { calendarId: 'primary', eventId: 'event-1', endTime: '2026-10-07T11:00:00Z' };

  it.each(['', undefined, null, 42, false, {}])('rejects invalid calendarId %j', (calendarId) => {
    const result = validateCalendarUpdateEvent({ ...validInput, calendarId });
    expect(result).toBe('INVALID_CALENDAR_ID');
  });

  it.each(['', undefined, null, 42, false, {}])('rejects invalid eventId %j', (eventId) => {
    const result = validateCalendarUpdateEvent({ ...validInput, eventId });
    expect(result).toBe('INVALID_EVENT_ID');
  });

  it.each([undefined, null, '', false, 0])('rejects absent or falsy endTime %j', (endTime) => {
    const result = validateCalendarUpdateEvent({ ...validInput, endTime });
    expect(result).toBe('INVALID_END_TIME');
  });

  it('accepts a complete event update', () => {
    const result = validateCalendarUpdateEvent(validInput);
    expect(result).toBe(null);
  });

  it('preserves nonempty whitespace identifiers without trimming', () => {
    const result = validateCalendarUpdateEvent({ ...validInput, calendarId: ' ', eventId: ' ' });
    expect(result).toBe(null);
  });

  it('reports invalid calendar id before other invalid fields', () => {
    const result = validateCalendarUpdateEvent({ calendarId: '', eventId: '', endTime: undefined });
    expect(result).toBe('INVALID_CALENDAR_ID');
  });

  it('reports invalid event id before invalid end time', () => {
    const result = validateCalendarUpdateEvent({ ...validInput, eventId: '', endTime: undefined });
    expect(result).toBe('INVALID_EVENT_ID');
  });
});

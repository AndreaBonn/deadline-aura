const { createCalendarHandlers } = require('../../../core/ipc/calendar-handlers');

function setup({ defaultCalendar } = {}) {
  let config = { sources: { google_calendar: { default_log_calendar: defaultCalendar } } };
  const gcal = {
    listCalendars: vi.fn(async () => [{ id: 'c1', summary: 'Work' }]),
    createEvent: vi.fn(async () => ({ id: 'ev1', htmlLink: 'https://link/ev1' })),
    updateEvent: vi.fn(async () => ({ id: 'ev2', htmlLink: 'https://link/ev2' })),
  };
  const saveConfig = vi.fn();
  const handlers = createCalendarHandlers({ gcal, getConfig: () => config, saveConfig });
  return {
    gcal,
    saveConfig,
    handlers,
    getConfig: () => config,
    replaceConfig: (next) => (config = next),
  };
}

describe('createCalendarHandlers', () => {
  let errorSpy;
  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => errorSpy.mockRestore());

  it('exposes exactly the five calendar channels', () => {
    expect(Object.keys(setup().handlers).sort()).toEqual([
      'calendar:get-default',
      'calendar:list',
      'calendar:log-time',
      'calendar:set-default',
      'calendar:update-event',
    ]);
  });

  describe('calendar:list', () => {
    it('returns calendars fetched with the current config', async () => {
      const { handlers, gcal, getConfig } = setup();
      expect(await handlers['calendar:list']()).toEqual({
        ok: true,
        calendars: [{ id: 'c1', summary: 'Work' }],
      });
      expect(gcal.listCalendars).toHaveBeenCalledWith(getConfig());
    });

    it('uses the config current at call time after it is reassigned', async () => {
      const { handlers, gcal, replaceConfig } = setup();
      const next = { sources: { google_calendar: { default_log_calendar: 'z' } } };
      replaceConfig(next);
      await handlers['calendar:list']();
      expect(gcal.listCalendars).toHaveBeenCalledWith(next);
    });

    it('returns the error message and logs when gcal throws', async () => {
      const { handlers, gcal } = setup();
      gcal.listCalendars.mockRejectedValue(new Error('quota'));
      expect(await handlers['calendar:list']()).toEqual({ ok: false, error: 'quota' });
      expect(errorSpy).toHaveBeenCalledWith('calendar:list error:', 'quota');
    });
  });

  describe('calendar:get-default / set-default', () => {
    it('returns the configured default calendar', () => {
      const { handlers } = setup({ defaultCalendar: 'abc' });
      expect(handlers['calendar:get-default']()).toEqual({ ok: true, calendarId: 'abc' });
    });

    it('returns an empty string when no default is set', () => {
      const { handlers } = setup();
      expect(handlers['calendar:get-default']()).toEqual({ ok: true, calendarId: '' });
    });

    it('set-default saves the config and the next get returns it', () => {
      const { handlers, saveConfig, getConfig } = setup();
      expect(handlers['calendar:set-default']('cal-7')).toEqual({ ok: true });
      expect(saveConfig).toHaveBeenCalledWith(getConfig());
      expect(getConfig().sources.google_calendar.default_log_calendar).toBe('cal-7');
      expect(handlers['calendar:get-default']()).toEqual({ ok: true, calendarId: 'cal-7' });
    });

    it.each([[undefined], [''], [12]])('set-default rejects %j and does not save', (id) => {
      const { handlers, saveConfig } = setup({ defaultCalendar: 'keep' });
      expect(handlers['calendar:set-default'](id)).toEqual({
        ok: false,
        error: 'INVALID_CALENDAR_ID',
      });
      expect(saveConfig).not.toHaveBeenCalled();
      expect(handlers['calendar:get-default']().calendarId).toBe('keep');
    });
  });

  describe('calendar:log-time', () => {
    const valid = { summary: 'Focus', startTime: '2026-10-19T09:00:00Z', durationMinutes: 30 };

    it('creates the event on the explicit calendar and returns id and link', async () => {
      const { handlers, gcal, getConfig } = setup({ defaultCalendar: 'def' });
      const result = await handlers['calendar:log-time']({ ...valid, calendarId: 'explicit' });
      expect(result).toEqual({ ok: true, eventId: 'ev1', htmlLink: 'https://link/ev1' });
      expect(gcal.createEvent).toHaveBeenCalledWith(getConfig(), {
        calendarId: 'explicit',
        summary: 'Focus',
        startTime: valid.startTime,
        durationMinutes: 30,
      });
    });

    it('falls back to the default calendar', async () => {
      const { handlers, gcal } = setup({ defaultCalendar: 'def' });
      await handlers['calendar:log-time'](valid);
      expect(gcal.createEvent.mock.calls[0][1].calendarId).toBe('def');
    });

    it('returns NO_CALENDAR_SELECTED with no calendar and no default', async () => {
      const { handlers, gcal } = setup();
      expect(await handlers['calendar:log-time'](valid)).toEqual({
        ok: false,
        error: 'NO_CALENDAR_SELECTED',
      });
      expect(gcal.createEvent).not.toHaveBeenCalled();
    });

    it.each([
      [{ ...valid, summary: '' }, 'INVALID_SUMMARY'],
      [{ ...valid, startTime: '' }, 'INVALID_TIME'],
      [{ ...valid, durationMinutes: 0 }, 'INVALID_TIME'],
      [{ ...valid, durationMinutes: '30' }, 'INVALID_TIME'],
    ])('rejects %j with %s before touching gcal', async (payload, error) => {
      const { handlers, gcal } = setup({ defaultCalendar: 'def' });
      expect(await handlers['calendar:log-time'](payload)).toEqual({ ok: false, error });
      expect(gcal.createEvent).not.toHaveBeenCalled();
    });

    it('returns the error message and logs when gcal throws', async () => {
      const { handlers, gcal } = setup({ defaultCalendar: 'def' });
      gcal.createEvent.mockRejectedValue(new Error('network'));
      expect(await handlers['calendar:log-time'](valid)).toEqual({ ok: false, error: 'network' });
      expect(errorSpy).toHaveBeenCalledWith('calendar:log-time error:', 'network');
    });
  });

  describe('calendar:update-event', () => {
    const valid = { calendarId: 'c1', eventId: 'e1', endTime: '2026-10-19T10:00:00Z' };

    it('updates the event and returns id and link', async () => {
      const { handlers, gcal, getConfig } = setup();
      expect(await handlers['calendar:update-event'](valid)).toEqual({
        ok: true,
        eventId: 'ev2',
        htmlLink: 'https://link/ev2',
      });
      expect(gcal.updateEvent).toHaveBeenCalledWith(getConfig(), valid);
    });

    it.each([
      [{ ...valid, calendarId: '' }, 'INVALID_CALENDAR_ID'],
      [{ ...valid, eventId: undefined }, 'INVALID_EVENT_ID'],
      [{ ...valid, endTime: '' }, 'INVALID_END_TIME'],
    ])('rejects %j with %s before touching gcal', async (payload, error) => {
      const { handlers, gcal } = setup();
      expect(await handlers['calendar:update-event'](payload)).toEqual({ ok: false, error });
      expect(gcal.updateEvent).not.toHaveBeenCalled();
    });

    it('returns the error message and logs when gcal throws', async () => {
      const { handlers, gcal } = setup();
      gcal.updateEvent.mockRejectedValue(new Error('gone'));
      expect(await handlers['calendar:update-event'](valid)).toEqual({
        ok: false,
        error: 'gone',
      });
      expect(errorSpy).toHaveBeenCalledWith('calendar:update-event error:', 'gone');
    });
  });
});

'use strict';

const { google } = require('googleapis');
const {
  fetchEvents,
  fetchCalendarEvents,
  MAX_PAGES,
} = require('../../integrations/google-calendar');

const CALENDAR_CONFIG = { calendars: ['primary'] };
const event = (id) => ({ id, summary: id, end: { dateTime: '2030-05-08T13:00:00Z' } });

describe('google-calendar — fetchEvents edge cases', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns empty array when google_calendar is disabled', async () => {
    const config = {
      sources: { google_calendar: { enabled: false, calendars: ['primary'] } },
    };
    const result = await fetchEvents(config);
    expect(result).toEqual([]);
  });

  it('returns empty array when GOOGLE_CLIENT_ID is missing', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const config = {
      sources: { google_calendar: { enabled: true, calendars: ['primary'] } },
    };
    const result = await fetchEvents(config);

    expect(result).toEqual([]);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('client_id and client_secret required'),
    );
    consoleSpy.mockRestore();
  });

  it('returns empty array when only GOOGLE_CLIENT_ID is set (no secret)', async () => {
    process.env.GOOGLE_CLIENT_ID = 'some-id';
    delete process.env.GOOGLE_CLIENT_SECRET;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const config = {
      sources: { google_calendar: { enabled: true, calendars: ['primary'] } },
    };
    const result = await fetchEvents(config);

    expect(result).toEqual([]);
    consoleSpy.mockRestore();
  });
});

describe('google-calendar — fetchCalendarEvents pagination', () => {
  let list;

  beforeEach(() => {
    list = vi.fn();
    vi.spyOn(google, 'calendar').mockReturnValue({ events: { list } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('follows nextPageToken and returns the events of every page', async () => {
    list.mockImplementation(async ({ pageToken }) =>
      pageToken === 'page-2'
        ? { data: { items: [event('e2')] } }
        : { data: { items: [event('e1')], nextPageToken: 'page-2' } },
    );

    const { allEvents, calendarErrors } = await fetchCalendarEvents({}, CALENDAR_CONFIG);

    expect(allEvents.map((e) => e.id)).toEqual(['gcal_e1', 'gcal_e2']);
    expect(calendarErrors).toEqual([]);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[0][0].pageToken).toBeUndefined();
    expect(list.mock.calls[1][0]).toMatchObject({ calendarId: 'primary', pageToken: 'page-2' });
    expect({ ...list.mock.calls[1][0], pageToken: undefined }).toEqual(list.mock.calls[0][0]);
  });

  it('makes a single call for a calendar without nextPageToken', async () => {
    list.mockResolvedValue({ data: { items: [event('e1')] } });

    const { allEvents } = await fetchCalendarEvents({}, CALENDAR_CONFIG);

    expect(allEvents.map((e) => e.id)).toEqual(['gcal_e1']);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('stops at the page cap, warns and keeps the events read when nextPageToken never ends', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    list.mockImplementation(async () => ({
      data: { items: [event('same')], nextPageToken: 'again' },
    }));

    const { allEvents, calendarErrors } = await fetchCalendarEvents({}, CALENDAR_CONFIG);

    expect(list).toHaveBeenCalledTimes(MAX_PAGES);
    expect(allEvents).toHaveLength(MAX_PAGES);
    expect(calendarErrors).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('primary'));
  });

  it('reports the calendar as failed when a later page cannot be read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    list.mockImplementation(async ({ pageToken }) => {
      if (pageToken) {
        throw new Error('page 2 unavailable');
      }
      return { data: { items: [event('e1')], nextPageToken: 'page-2' } };
    });

    const { calendarErrors } = await fetchCalendarEvents({}, CALENDAR_CONFIG);

    expect(calendarErrors).toEqual([{ calendarId: 'primary', message: 'page 2 unavailable' }]);
  });
});

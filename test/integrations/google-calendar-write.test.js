'use strict';

const fs = require('fs');
const { google } = require('googleapis');
const { createEvent, updateEvent, listCalendars } = require('../../integrations/google-calendar');

const CONFIG = {
  sources: {
    google_calendar: {
      enabled: true,
      oauth: { client_id: 'fake-client-id', client_secret: 'fake-client-secret' },
    },
  },
};
const START_TIME = '2030-05-08T10:00:00.000Z';
const END_TIME = '2030-05-08T11:00:00.000Z';
const DURATION_MINUTES = 60;
const API_EVENT = {
  id: 'saved-event',
  htmlLink: 'https://calendar.google.com/event/saved-event',
  summary: 'Planning',
};

describe('google-calendar — write operations', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('createEvent', () => {
    it('throws when GOOGLE_CLIENT_ID is missing', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;

      const config = { sources: { google_calendar: { enabled: true } } };

      await expect(
        createEvent(config, {
          calendarId: 'primary',
          summary: '[PROJ-42] - Fix bug',
          startTime: START_TIME,
          durationMinutes: 60,
        }),
      ).rejects.toThrow('client_id and client_secret required (settings or env)');
    });

    it('throws when only GOOGLE_CLIENT_ID is set', async () => {
      process.env.GOOGLE_CLIENT_ID = 'some-id';
      delete process.env.GOOGLE_CLIENT_SECRET;

      const config = { sources: { google_calendar: { enabled: true } } };

      await expect(
        createEvent(config, {
          calendarId: 'primary',
          summary: 'Test',
          startTime: START_TIME,
          durationMinutes: 30,
        }),
      ).rejects.toThrow('client_id and client_secret required (settings or env)');
    });
  });

  describe('updateEvent', () => {
    it('throws when GOOGLE_CLIENT_ID is missing', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;

      const config = { sources: { google_calendar: { enabled: true } } };

      await expect(
        updateEvent(config, {
          calendarId: 'primary',
          eventId: 'evt123',
          endTime: END_TIME,
        }),
      ).rejects.toThrow('client_id and client_secret required (settings or env)');
    });

    it('throws when endTime is invalid', async () => {
      process.env.GOOGLE_CLIENT_ID = 'test-id';
      process.env.GOOGLE_CLIENT_SECRET = 'test-secret';

      const config = { sources: { google_calendar: { enabled: true } } };

      await expect(
        updateEvent(config, {
          calendarId: 'primary',
          eventId: 'evt123',
          endTime: 'not-a-date',
        }),
      ).rejects.toThrow('Invalid endTime');
    });
  });

  describe('listCalendars', () => {
    it('returns empty array when google_calendar is disabled', async () => {
      const config = {
        sources: { google_calendar: { enabled: false, calendars: ['primary'] } },
      };
      const result = await listCalendars(config);
      expect(result).toEqual([]);
    });

    it('returns empty array when credentials are missing', async () => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;

      const config = {
        sources: { google_calendar: { enabled: true, calendars: ['primary'] } },
      };
      const result = await listCalendars(config);
      expect(result).toEqual([]);
    });
  });
});

describe('google-calendar successful API operations', () => {
  let calendar;

  beforeEach(() => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ access_token: 'fake-access-token', refresh_token: 'fake-refresh-token' }),
    );
    calendar = {
      events: {
        insert: vi.fn().mockResolvedValue({ data: API_EVENT }),
        patch: vi.fn().mockResolvedValue({ data: API_EVENT }),
      },
      calendarList: { list: vi.fn() },
    };
    vi.spyOn(google, 'calendar').mockReturnValue(calendar);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createEvent_valid_event_inserts_and_returns_id_and_link', async () => {
    const input = {
      calendarId: 'work',
      summary: 'Planning',
      startTime: START_TIME,
      durationMinutes: DURATION_MINUTES,
    };

    const result = await createEvent(CONFIG, input);

    expect(calendar.events.insert).toHaveBeenCalledWith({
      calendarId: 'work',
      requestBody: {
        summary: 'Planning',
        start: { dateTime: START_TIME },
        end: { dateTime: END_TIME },
      },
    });
    expect(result).toEqual({ id: API_EVENT.id, htmlLink: API_EVENT.htmlLink });
  });

  it('updateEvent_valid_end_patches_and_returns_id_and_link', async () => {
    const input = { calendarId: 'work', eventId: 'saved-event', endTime: END_TIME };

    const result = await updateEvent(CONFIG, input);

    expect(calendar.events.patch).toHaveBeenCalledWith({
      calendarId: 'work',
      eventId: 'saved-event',
      requestBody: { end: { dateTime: END_TIME } },
    });
    expect(result).toEqual({ id: API_EVENT.id, htmlLink: API_EVENT.htmlLink });
  });

  it('listCalendars_mixed_access_returns_only_owner_and_writer', async () => {
    calendar.calendarList.list.mockResolvedValue({
      data: {
        items: [
          { id: 'read-only', summary: 'Read only', accessRole: 'reader' },
          { id: 'personal', summary: 'Personal', accessRole: 'owner' },
          { id: 'work', accessRole: 'writer' },
        ],
      },
    });

    const result = await listCalendars(CONFIG);

    expect(result).toEqual([
      { id: 'personal', summary: 'Personal', accessRole: 'owner' },
      { id: 'work', summary: 'work', accessRole: 'writer' },
    ]);
  });
});

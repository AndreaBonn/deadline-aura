'use strict';

const { createEvent, listCalendars } = require('../../integrations/google-calendar');

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
          startTime: new Date().toISOString(),
          durationMinutes: 60,
        }),
      ).rejects.toThrow('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required');
    });

    it('throws when only GOOGLE_CLIENT_ID is set', async () => {
      process.env.GOOGLE_CLIENT_ID = 'some-id';
      delete process.env.GOOGLE_CLIENT_SECRET;

      const config = { sources: { google_calendar: { enabled: true } } };

      await expect(
        createEvent(config, {
          calendarId: 'primary',
          summary: 'Test',
          startTime: new Date().toISOString(),
          durationMinutes: 30,
        }),
      ).rejects.toThrow('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required');
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

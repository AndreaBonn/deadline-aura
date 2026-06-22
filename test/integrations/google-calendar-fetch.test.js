'use strict';

const { fetchEvents } = require('../../integrations/google-calendar');

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

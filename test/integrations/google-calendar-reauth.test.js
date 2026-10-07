'use strict';

const fs = require('fs');
const { google } = require('googleapis');

const {
  isInvalidGrant,
  deleteToken,
  fetchEvents,
  fetchCalendarEvents,
  TOKEN_PATH,
} = require('../../integrations/google-calendar');

const CONFIG = {
  sources: {
    google_calendar: {
      enabled: true,
      calendars: ['primary', 'work'],
      oauth: { client_id: 'fake-client-id', client_secret: 'fake-client-secret' },
    },
  },
};
const UPCOMING_EVENT = {
  id: 'work-event',
  summary: 'Work meeting',
  end: { dateTime: '2030-05-08T13:00:00Z' },
};

describe('isInvalidGrant', () => {
  it('returns true for invalid_grant message', () => {
    expect(isInvalidGrant('invalid_grant')).toBe(true);
  });

  it('returns true when invalid_grant is part of longer message', () => {
    expect(isInvalidGrant('Token has been expired or revoked: invalid_grant')).toBe(true);
  });

  it('returns false for other error messages', () => {
    expect(isInvalidGrant('Network timeout')).toBe(false);
    expect(isInvalidGrant('invalid_client')).toBe(false);
    expect(isInvalidGrant('ECONNREFUSED')).toBe(false);
  });

  it('returns false for non-string input', () => {
    expect(isInvalidGrant(null)).toBe(false);
    expect(isInvalidGrant(undefined)).toBe(false);
    expect(isInvalidGrant(42)).toBe(false);
  });
});

describe('deleteToken', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls unlinkSync on TOKEN_PATH', () => {
    const unlinkSpy = vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    deleteToken();

    expect(unlinkSpy).toHaveBeenCalledWith(TOKEN_PATH);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('deleted expired token'));
  });

  it('does not throw if token file is already gone', () => {
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      throw new Error('ENOENT');
    });

    expect(() => deleteToken()).not.toThrow();
  });
});

describe('fetchEvents invalid_grant recovery', () => {
  let client;
  let list;
  const authRequired = new Error('Fake OAuth flow requested');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-05-08T12:00:00Z'));
    client = new google.auth.OAuth2();
    vi.spyOn(google.auth, 'OAuth2').mockImplementation(() => client);
    vi.spyOn(client, 'generateAuthUrl').mockImplementation(() => {
      throw authRequired;
    });
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(
      JSON.stringify({ access_token: 'fake-access-token', refresh_token: 'fake-refresh-token' }),
    );
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {});
    list = vi.fn();
    vi.spyOn(google, 'calendar').mockReturnValue({ events: { list } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fetchCalendarEvents_partial_failure_returns_events_and_calendar_errors', async () => {
    list.mockImplementation(({ calendarId }) =>
      calendarId === 'primary'
        ? Promise.reject(new Error('Network timeout'))
        : Promise.resolve({ data: { items: [UPCOMING_EVENT] } }),
    );

    const result = await fetchCalendarEvents(client, CONFIG.sources.google_calendar);

    expect(result).toEqual({
      allEvents: [expect.objectContaining({ id: 'gcal_work-event', title: 'Work meeting' })],
      calendarErrors: [{ calendarId: 'primary', message: 'Network timeout' }],
    });
  });

  it('fetchEvents_all_invalid_grant_deletes_token_and_requests_oauth', async () => {
    list.mockRejectedValue(new Error('Token revoked: invalid_grant'));
    fs.existsSync.mockReturnValueOnce(true).mockReturnValue(false);

    const result = fetchEvents(CONFIG);

    await expect(result).rejects.toBe(authRequired);
    expect(fs.unlinkSync).toHaveBeenCalledWith(TOKEN_PATH);
    expect(fs.unlinkSync).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledTimes(CONFIG.sources.google_calendar.calendars.length);
    expect(client.generateAuthUrl).toHaveBeenCalledWith(
      expect.objectContaining({ access_type: 'offline', prompt: 'consent' }),
    );
    expect(fs.unlinkSync.mock.invocationCallOrder[0]).toBeLessThan(
      client.generateAuthUrl.mock.invocationCallOrder[0],
    );
  });

  it('fetchEvents_mixed_errors_reports_failures_without_reauthentication', async () => {
    list.mockRejectedValueOnce(new Error('invalid_grant'));
    list.mockRejectedValueOnce(new Error('Network timeout'));

    const result = fetchEvents(CONFIG);

    await expect(result).rejects.toThrow(
      'All calendars failed: primary: invalid_grant; work: Network timeout',
    );
    expect(list).toHaveBeenCalledTimes(CONFIG.sources.google_calendar.calendars.length);
    expect(fs.unlinkSync).not.toHaveBeenCalled();
    expect(client.generateAuthUrl).not.toHaveBeenCalled();
  });

  it('fetchEvents_partial_invalid_grant_returns_events_without_reauthentication', async () => {
    list.mockRejectedValueOnce(new Error('invalid_grant'));
    list.mockResolvedValueOnce({ data: { items: [UPCOMING_EVENT] } });

    const result = await fetchEvents(CONFIG);

    expect(result).toEqual([expect.objectContaining({ id: 'gcal_work-event' })]);
    expect(list).toHaveBeenCalledTimes(CONFIG.sources.google_calendar.calendars.length);
    expect(fs.unlinkSync).not.toHaveBeenCalled();
    expect(client.generateAuthUrl).not.toHaveBeenCalled();
  });
});

'use strict';

const fs = require('fs');

const { isInvalidGrant, deleteToken, TOKEN_PATH } = require('../../integrations/google-calendar');

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

describe('fetchEvents — invalid_grant retry logic', () => {
  it('detects when all calendar errors are invalid_grant', () => {
    const errors = [
      { calendarId: 'primary', message: 'invalid_grant' },
      { calendarId: 'work', message: 'invalid_grant' },
    ];
    const calendars = ['primary', 'work'];

    const allInvalidGrant =
      errors.length === calendars.length && errors.every((e) => isInvalidGrant(e.message));

    expect(allInvalidGrant).toBe(true);
  });

  it('does not trigger retry when errors are mixed', () => {
    const errors = [
      { calendarId: 'primary', message: 'invalid_grant' },
      { calendarId: 'work', message: 'Network timeout' },
    ];
    const calendars = ['primary', 'work'];

    const allInvalidGrant =
      errors.length === calendars.length && errors.every((e) => isInvalidGrant(e.message));

    expect(allInvalidGrant).toBe(false);
  });

  it('does not trigger retry when not all calendars failed', () => {
    const errors = [{ calendarId: 'primary', message: 'invalid_grant' }];
    const calendars = ['primary', 'work'];

    const allInvalidGrant =
      errors.length === calendars.length && errors.every((e) => isInvalidGrant(e.message));

    expect(allInvalidGrant).toBe(false);
  });
});

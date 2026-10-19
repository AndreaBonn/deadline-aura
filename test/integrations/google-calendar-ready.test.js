'use strict';

const fs = require('fs');
const { isGoogleCalendarReady } = require('../../integrations/google-calendar');

function makeConfig({ enabled = true, clientId = 'id', clientSecret = 'secret' } = {}) {
  return {
    sources: {
      google_calendar: { enabled, oauth: { client_id: clientId, client_secret: clientSecret } },
    },
  };
}

describe('google-calendar — isGoogleCalendarReady', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('is ready when enabled, configured and authorized', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    expect(isGoogleCalendarReady(makeConfig())).toBe(true);
  });

  it('is not ready before the user has authorized the account', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

    expect(isGoogleCalendarReady(makeConfig())).toBe(false);
  });

  it('is not ready without client credentials', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    expect(isGoogleCalendarReady(makeConfig({ clientId: '', clientSecret: '' }))).toBe(false);
  });

  it('is not ready when the source is switched off', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);

    expect(isGoogleCalendarReady(makeConfig({ enabled: false }))).toBe(false);
  });
});

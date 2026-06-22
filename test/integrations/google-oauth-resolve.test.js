'use strict';

const { resolveGoogleOAuth } = require('../../integrations/google-calendar');

describe('google-calendar — resolveGoogleOAuth', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('uses settings oauth credentials when present', () => {
    process.env.GOOGLE_CLIENT_ID = 'env-id';
    process.env.GOOGLE_CLIENT_SECRET = 'env-secret';

    const config = {
      sources: {
        google_calendar: {
          oauth: { client_id: 'cfg-id', client_secret: 'cfg-secret' },
        },
      },
    };

    expect(resolveGoogleOAuth(config)).toEqual({
      clientId: 'cfg-id',
      clientSecret: 'cfg-secret',
    });
  });

  it('falls back to env vars when settings oauth is empty', () => {
    process.env.GOOGLE_CLIENT_ID = 'env-id';
    process.env.GOOGLE_CLIENT_SECRET = 'env-secret';

    const config = {
      sources: { google_calendar: { oauth: { client_id: '', client_secret: '' } } },
    };

    expect(resolveGoogleOAuth(config)).toEqual({
      clientId: 'env-id',
      clientSecret: 'env-secret',
    });
  });

  it('falls back to env vars when oauth key is absent', () => {
    process.env.GOOGLE_CLIENT_ID = 'env-id';
    process.env.GOOGLE_CLIENT_SECRET = 'env-secret';

    const config = { sources: { google_calendar: {} } };

    expect(resolveGoogleOAuth(config)).toEqual({
      clientId: 'env-id',
      clientSecret: 'env-secret',
    });
  });

  it('returns empty strings when neither settings nor env provide credentials', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    const config = { sources: { google_calendar: {} } };

    expect(resolveGoogleOAuth(config)).toEqual({ clientId: '', clientSecret: '' });
  });

  it('trims whitespace-only settings values and falls back to env', () => {
    process.env.GOOGLE_CLIENT_ID = 'env-id';
    process.env.GOOGLE_CLIENT_SECRET = 'env-secret';

    const config = {
      sources: { google_calendar: { oauth: { client_id: '   ', client_secret: '  ' } } },
    };

    expect(resolveGoogleOAuth(config)).toEqual({
      clientId: 'env-id',
      clientSecret: 'env-secret',
    });
  });
});

'use strict';

const fs = require('fs');
const http = require('http');
const childProcess = require('child_process');
const { EventEmitter } = require('events');
const { google } = require('googleapis');
const { getAuthenticatedClient, authorizeGoogle } = require('../../integrations/google-calendar');

const TOKENS = { access_token: 'new-access', refresh_token: 'new-refresh' };

function makeConfig(clientId = 'id', clientSecret = 'secret') {
  return {
    sources: {
      google_calendar: {
        enabled: true,
        oauth: { client_id: clientId, client_secret: clientSecret },
      },
    },
  };
}

// Fake OAuth callback server: records the handler so the test can play the browser.
function fakeServer() {
  const server = new EventEmitter();
  server.listen = vi.fn((_port, onListening) => onListening());
  server.close = vi.fn();
  return server;
}

function callback(handler, state) {
  const res = { writeHead: vi.fn(), end: vi.fn() };
  return handler({ url: `/oauth/callback?state=${state}&code=abc` }, res);
}

describe('google-calendar — shared OAuth flow', () => {
  const originalEnv = { ...process.env };
  let server;
  let handler;

  beforeEach(() => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    server = fakeServer();
    vi.spyOn(http, 'createServer').mockImplementation((h) => {
      handler = h;
      return server;
    });
    vi.spyOn(childProcess, 'spawn').mockReturnValue({ unref: vi.fn() });
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'chmodSync').mockImplementation(() => {});
    vi.spyOn(google.auth.OAuth2.prototype, 'getToken').mockResolvedValue({ tokens: TOKENS });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  function stateFromAuthUrl() {
    const url = new URL(childProcess.spawn.mock.calls[0][1][0]);
    return url.searchParams.get('state');
  }

  it('opens one consent page and one callback server for concurrent callers', async () => {
    const first = getAuthenticatedClient('id', 'secret');
    const second = getAuthenticatedClient('id', 'secret');

    await callback(handler, stateFromAuthUrl());
    const [clientA, clientB] = await Promise.all([first, second]);

    expect(http.createServer).toHaveBeenCalledTimes(1);
    expect(childProcess.spawn).toHaveBeenCalledTimes(1);
    expect(clientA.credentials).toEqual(TOKENS);
    expect(clientB.credentials).toEqual(TOKENS);
  });

  it('starts a fresh flow after the previous one has finished', async () => {
    const first = getAuthenticatedClient('id', 'secret');
    await callback(handler, stateFromAuthUrl());
    await first;

    const second = getAuthenticatedClient('id', 'secret');
    expect(http.createServer).toHaveBeenCalledTimes(2);

    // Complete it too: an unfinished flow would leak into the next test.
    const secondState = new URL(childProcess.spawn.mock.calls[1][1][0]).searchParams.get('state');
    await callback(handler, secondState);
    await second;
  });

  it('authorizeGoogle reports success once the user has granted access', async () => {
    const result = authorizeGoogle(makeConfig());
    await callback(handler, stateFromAuthUrl());

    await expect(result).resolves.toEqual({ ok: true });
  });

  it('authorizeGoogle refuses to start without client credentials', async () => {
    await expect(authorizeGoogle(makeConfig('', ''))).resolves.toEqual({
      ok: false,
      error: 'MISSING_CREDENTIALS',
    });
    expect(http.createServer).not.toHaveBeenCalled();
  });

  it('authorizeGoogle does not reopen the consent page when already authorized', async () => {
    fs.existsSync.mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(TOKENS));
    vi.spyOn(google.auth.OAuth2.prototype, 'getAccessToken').mockResolvedValue({ token: 'ok' });

    await expect(authorizeGoogle(makeConfig())).resolves.toEqual({
      ok: true,
      alreadyAuthorized: true,
    });
    expect(http.createServer).not.toHaveBeenCalled();
  });

  it('authorizeGoogle names a busy callback port', async () => {
    server.listen = vi.fn(() => {
      const err = new Error('listen EADDRINUSE');
      err.code = 'EADDRINUSE';
      server.emit('error', err);
    });

    await expect(authorizeGoogle(makeConfig())).resolves.toEqual({
      ok: false,
      error: 'PORT_IN_USE',
    });
  });

  it('authorizeGoogle asks for consent again when the saved token was revoked', async () => {
    fs.existsSync.mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(TOKENS));
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      fs.existsSync.mockReturnValue(false);
    });
    vi.spyOn(google.auth.OAuth2.prototype, 'getAccessToken').mockRejectedValue(
      new Error('invalid_grant'),
    );

    const result = authorizeGoogle(makeConfig());
    await vi.waitFor(() => expect(http.createServer).toHaveBeenCalledTimes(1));
    await callback(handler, stateFromAuthUrl());

    await expect(result).resolves.toEqual({ ok: true });
    expect(fs.unlinkSync).toHaveBeenCalled();
  });

  it('refuses to join a pending consent flow started with other client credentials', async () => {
    const background = getAuthenticatedClient('old-id', 'old-secret');

    await expect(authorizeGoogle(makeConfig('new-id', 'new-secret'))).resolves.toEqual({
      ok: false,
      error: 'AUTH_IN_PROGRESS',
    });

    await callback(handler, stateFromAuthUrl());
    await background;
  });

  it('authorizeGoogle asks for consent again when the saved token cannot be refreshed', async () => {
    fs.existsSync.mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(TOKENS));
    vi.spyOn(fs, 'unlinkSync').mockImplementation(() => {
      fs.existsSync.mockReturnValue(false);
    });
    vi.spyOn(google.auth.OAuth2.prototype, 'getAccessToken').mockRejectedValue(
      new Error('No refresh token is set.'),
    );

    const result = authorizeGoogle(makeConfig());
    await vi.waitFor(() => expect(http.createServer).toHaveBeenCalledTimes(1));
    await callback(handler, stateFromAuthUrl());

    await expect(result).resolves.toEqual({ ok: true });
  });
});

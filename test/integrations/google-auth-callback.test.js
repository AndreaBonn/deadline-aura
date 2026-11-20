'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const childProcess = require('child_process');
const { EventEmitter } = require('events');
const { google } = require('googleapis');
const { getAuthenticatedClient, TOKEN_PATH } = require('../../integrations/google-auth');

const TOKENS = { access_token: 'new-access', refresh_token: 'new-refresh' };
const SAVED_TOKEN = { access_token: 'old-access', refresh_token: 'old-refresh' };

function fakeServer() {
  const server = new EventEmitter();
  server.listen = vi.fn((_port, onListening) => onListening());
  server.close = vi.fn();
  return server;
}

function browserRequest(handler, query) {
  const res = { writeHead: vi.fn(), end: vi.fn() };
  const done = handler({ url: `/oauth/callback?${query}` }, res);
  return { res, done };
}

describe('google-auth — OAuth callback security', () => {
  let handler;
  let getToken;

  beforeEach(() => {
    vi.spyOn(http, 'createServer').mockImplementation((h) => {
      handler = h;
      return fakeServer();
    });
    vi.spyOn(childProcess, 'spawn').mockReturnValue({ unref: vi.fn() });
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'chmodSync').mockImplementation(() => {});
    getToken = vi
      .spyOn(google.auth.OAuth2.prototype, 'getToken')
      .mockResolvedValue({ tokens: TOKENS });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function issuedState() {
    return new URL(childProcess.spawn.mock.calls[0][1][0]).searchParams.get('state');
  }

  it('rejects a callback with a wrong state with 403 and never exchanges the code', async () => {
    const flow = getAuthenticatedClient('id', 'secret');
    const flowOutcome = flow.then(
      () => 'resolved',
      () => 'rejected',
    );

    const forged = browserRequest(handler, 'state=forged-state&code=attacker-code');
    await forged.done;

    expect(forged.res.writeHead).toHaveBeenCalledWith(403);
    expect(getToken).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();

    // Positive pair: the same flow still completes with the state it issued.
    const genuine = browserRequest(handler, `state=${issuedState()}&code=real-code`);
    await genuine.done;
    await expect(flowOutcome).resolves.toBe('resolved');
    expect(getToken).toHaveBeenCalledWith('real-code');
    expect(genuine.res.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'text/html' });
  });

  it('rejects a callback without any state parameter with 403', async () => {
    const flow = getAuthenticatedClient('id', 'secret');
    const flowDone = flow.catch(() => {});

    const missing = browserRequest(handler, 'code=attacker-code');
    await missing.done;

    expect(missing.res.writeHead).toHaveBeenCalledWith(403);
    expect(getToken).not.toHaveBeenCalled();

    await browserRequest(handler, `state=${issuedState()}&code=real-code`).done;
    await flowDone;
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('stores the token file readable only by the owner in a private directory', async () => {
    const flow = getAuthenticatedClient('id', 'secret');
    await browserRequest(handler, `state=${issuedState()}&code=real-code`).done;
    await flow;

    const configDir = path.dirname(TOKEN_PATH);
    expect(fs.mkdirSync).toHaveBeenCalledWith(configDir, { recursive: true, mode: 0o700 });
    expect(fs.writeFileSync).toHaveBeenCalledWith(TOKEN_PATH, JSON.stringify(TOKENS, null, 2));
    expect(fs.chmodSync).toHaveBeenCalledWith(TOKEN_PATH, 0o600);
  });
});

describe('google-auth — refreshed tokens are persisted', () => {
  let client;

  beforeEach(() => {
    client = new google.auth.OAuth2();
    vi.spyOn(google.auth, 'OAuth2').mockImplementation(() => client);
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(SAVED_TOKEN));
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
    vi.spyOn(fs, 'chmodSync').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes the refreshed access token merged with the saved refresh token, mode 0600', async () => {
    await getAuthenticatedClient('id', 'secret');
    expect(fs.writeFileSync).not.toHaveBeenCalled();

    client.emit('tokens', { access_token: 'refreshed-access', expiry_date: 1900000000000 });

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const [writtenPath, body] = fs.writeFileSync.mock.calls[0];
    expect(writtenPath).toBe(TOKEN_PATH);
    expect(JSON.parse(body)).toEqual({
      access_token: 'refreshed-access',
      refresh_token: 'old-refresh',
      expiry_date: 1900000000000,
    });
    expect(fs.chmodSync).toHaveBeenCalledWith(TOKEN_PATH, 0o600);
  });
});

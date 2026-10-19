'use strict';

const { google } = require('googleapis');
const crypto = require('crypto');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');

const CONFIG_DIR = path.join(os.homedir(), '.config', 'deadlineaura');
const TOKEN_PATH = path.join(CONFIG_DIR, 'google-token.json');
const OAUTH_PORT = 34567;
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/tasks.readonly',
];

/**
 * Resolve the Google OAuth client credentials.
 *
 * Values entered from the settings UI (config.sources.google_calendar.oauth)
 * take precedence over the GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET environment
 * variables, which remain a fallback for development and headless setups.
 *
 * @param {object} config - Application config.
 * @returns {{clientId: string, clientSecret: string}} Resolved credentials; empty strings when unset.
 */
function resolveGoogleOAuth(config) {
  const oauth = config?.sources?.google_calendar?.oauth || {};
  const clientId =
    (oauth.client_id && oauth.client_id.trim()) || process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret =
    (oauth.client_secret && oauth.client_secret.trim()) || process.env.GOOGLE_CLIENT_SECRET || '';
  return { clientId, clientSecret };
}

function createOAuthClient(clientId, clientSecret) {
  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    `http://localhost:${OAUTH_PORT}/oauth/callback`,
  );
}

function loadSavedToken(oAuth2Client) {
  if (!fs.existsSync(TOKEN_PATH)) {
    return false;
  }

  let token;
  try {
    token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));
  } catch {
    console.error('Google Calendar: token file corrupted, re-authenticating');
    return false;
  }

  if (!token || typeof token !== 'object' || (!token.access_token && !token.refresh_token)) {
    console.error('Google Calendar: token file invalid, re-authenticating');
    return false;
  }

  oAuth2Client.setCredentials(token);

  oAuth2Client.on('tokens', (newTokens) => {
    const merged = { ...token, ...newTokens };
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2));
    fs.chmodSync(TOKEN_PATH, 0o600);
  });

  return true;
}

function readAuthorizationCode(req, res, oauthState) {
  const url = new URL(req.url, `http://localhost:${OAUTH_PORT}`);
  if (url.pathname !== '/oauth/callback') {
    res.writeHead(404);
    res.end();
    return null;
  }
  if (url.searchParams.get('state') !== oauthState) {
    res.writeHead(403);
    res.end('Invalid OAuth state — possible CSRF attempt');
    return null;
  }
  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400);
    res.end('Missing authorization code');
  }
  return code;
}

function createAuthCallback(oAuth2Client, oauthState, complete) {
  return async (req, res) => {
    try {
      const code = readAuthorizationCode(req, res, oauthState);
      if (!code) {
        return;
      }
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);
      fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      fs.chmodSync(TOKEN_PATH, 0o600);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h1>DeadlineAura authorized</h1><p>You can close this window.</p>');
      complete(null, tokens);
    } catch (err) {
      res.writeHead(500);
      res.end('Authorization failed');
      complete(err);
    }
  };
}

function createAuthorizationUrl(oAuth2Client, oauthState) {
  return oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: oauthState,
  });
}

function startAuthFlow(oAuth2Client) {
  return new Promise((resolve, reject) => {
    const oauthState = crypto.randomBytes(16).toString('hex');
    const authUrl = createAuthorizationUrl(oAuth2Client, oauthState);
    const complete = (err, tokens) => {
      clearTimeout(authTimeout);
      server.close();
      if (err) {
        reject(err);
      } else {
        resolve(tokens);
      }
    };
    const server = http.createServer(createAuthCallback(oAuth2Client, oauthState, complete));
    const authTimeout = setTimeout(() => {
      server.close();
      reject(new Error('OAuth timeout: flow not completed within 5 minutes'));
    }, OAUTH_TIMEOUT_MS);
    server.listen(OAUTH_PORT, () => {
      const { spawn } = require('child_process');
      spawn('xdg-open', [authUrl], { detached: true, stdio: 'ignore' }).unref();
    });
    server.on('error', (err) => {
      clearTimeout(authTimeout);
      reject(err);
    });
  });
}

// Only one consent page and one callback server at a time: the settings button and a
// background sync can both ask for authorization, and they would fight over the port.
// A caller with other client credentials may not join: the token it got would belong
// to the wrong client and every later refresh would fail.
let pendingAuthFlow = null; // { clientId, promise }

function runSharedAuthFlow(oAuth2Client, clientId) {
  if (pendingAuthFlow) {
    if (pendingAuthFlow.clientId !== clientId) {
      const busy = new Error('Another Google authorization is in progress');
      busy.code = 'AUTH_IN_PROGRESS';
      return Promise.reject(busy);
    }
    return pendingAuthFlow.promise.then((tokens) => {
      oAuth2Client.setCredentials(tokens);
      return tokens;
    });
  }
  const promise = startAuthFlow(oAuth2Client).finally(() => {
    pendingAuthFlow = null;
  });
  pendingAuthFlow = { clientId, promise };
  return promise;
}

async function getAuthenticatedClient(clientId, clientSecret) {
  const oAuth2Client = createOAuthClient(clientId, clientSecret);

  if (loadSavedToken(oAuth2Client)) {
    return oAuth2Client;
  }

  await runSharedAuthFlow(oAuth2Client, clientId);
  return oAuth2Client;
}

async function checkSavedAuthorization(existing) {
  try {
    // A token file can survive a revocation: prove it still works before saying so.
    await existing.getAccessToken();
    return { ok: true, alreadyAuthorized: true };
  } catch (err) {
    // Revoked, or an old token that can no longer be refreshed: ask for consent again.
    // Anything else (offline, Google down) is reported as is, the token may still be good.
    if (!isInvalidGrant(err.message) && !/no refresh token/i.test(err.message)) {
      return { ok: false, error: err.message };
    }
    deleteToken();
  }
  return null;
}

/**
 * Starts the Google consent flow on request, from the settings window.
 *
 * @param {object} config - Application config with the saved client credentials.
 * @returns {Promise<{ok: boolean, alreadyAuthorized?: boolean, error?: string}>} Outcome;
 *   error is MISSING_CREDENTIALS, PORT_IN_USE, AUTH_IN_PROGRESS or the underlying message.
 */
async function authorizeGoogle(config) {
  const { clientId, clientSecret } = resolveGoogleOAuth(config);
  if (!clientId || !clientSecret) {
    return { ok: false, error: 'MISSING_CREDENTIALS' };
  }
  const existing = createOAuthClient(clientId, clientSecret);
  if (loadSavedToken(existing)) {
    const savedResult = await checkSavedAuthorization(existing);
    if (savedResult) {
      return savedResult;
    }
  }
  try {
    await getAuthenticatedClient(clientId, clientSecret);
    return { ok: true };
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      return { ok: false, error: 'PORT_IN_USE' };
    }
    return { ok: false, error: err.code === 'AUTH_IN_PROGRESS' ? err.code : err.message };
  }
}

function isInvalidGrant(errorMessage) {
  return typeof errorMessage === 'string' && errorMessage.includes('invalid_grant');
}

/**
 * Whether Google Calendar can be used right now: switched on, with client credentials
 * and an authorization already granted by the user.
 *
 * @param {object} config - Application config.
 * @returns {boolean} True when time logging and the live timer can write events.
 */
function isGoogleCalendarReady(config) {
  if (!config?.sources?.google_calendar?.enabled) {
    return false;
  }
  const { clientId, clientSecret } = resolveGoogleOAuth(config);
  return Boolean(clientId && clientSecret) && fs.existsSync(TOKEN_PATH);
}

function deleteToken() {
  try {
    fs.unlinkSync(TOKEN_PATH);
    console.log('Google Calendar: deleted expired token, will re-authenticate');
  } catch {
    // token file already gone
  }
}

module.exports = {
  getAuthenticatedClient,
  resolveGoogleOAuth,
  isInvalidGrant,
  deleteToken,
  isGoogleCalendarReady,
  authorizeGoogle,
  TOKEN_PATH,
};

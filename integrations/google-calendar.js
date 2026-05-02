'use strict';

const { google } = require('googleapis');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');

const CONFIG_DIR = path.join(os.homedir(), '.config', 'deadlineaura');
const TOKEN_PATH = path.join(CONFIG_DIR, 'google-token.json');
const OAUTH_PORT = 34567;
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

const PRIORITY_KEYWORDS_DEFAULT = ['urgent', 'deadline', 'release', 'deploy', 'critico'];
const RED_COLOR_ID = '11';

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

function startAuthFlow(oAuth2Client) {
  return new Promise((resolve, reject) => {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://localhost:${OAUTH_PORT}`);
        if (url.pathname !== '/oauth/callback') {
          res.writeHead(404);
          res.end();
          return;
        }

        const code = url.searchParams.get('code');
        if (!code) {
          res.writeHead(400);
          res.end('Missing authorization code');
          return;
        }

        const { tokens } = await oAuth2Client.getToken(code);
        oAuth2Client.setCredentials(tokens);

        fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
        fs.chmodSync(TOKEN_PATH, 0o600);

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>DeadlineAura authorized</h1><p>You can close this window.</p>');

        server.close();
        resolve(tokens);
      } catch (err) {
        res.writeHead(500);
        res.end('Authorization failed');
        server.close();
        reject(err);
      }
    });

    server.listen(OAUTH_PORT, () => {
      const { spawn } = require('child_process');
      spawn('xdg-open', [authUrl], { detached: true, stdio: 'ignore' }).unref();
    });

    server.on('error', reject);
  });
}

async function getAuthenticatedClient(clientId, clientSecret) {
  const oAuth2Client = createOAuthClient(clientId, clientSecret);

  if (loadSavedToken(oAuth2Client)) {
    return oAuth2Client;
  }

  await startAuthFlow(oAuth2Client);
  return oAuth2Client;
}

function assignPriority(event, priorityKeywords) {
  const keywords = priorityKeywords || PRIORITY_KEYWORDS_DEFAULT;

  if (event.colorId === RED_COLOR_ID) {
    return 1;
  }

  const title = (event.summary || '').toLowerCase();
  const description = (event.description || '').toLowerCase();
  const combined = `${title} ${description}`;

  for (const kw of keywords) {
    if (combined.includes(kw.toLowerCase())) {
      return 2;
    }
  }

  return 3;
}

function normalizeEvent(event, priorityKeywords) {
  const endTime = event.end?.dateTime
    ? new Date(event.end.dateTime).getTime()
    : event.end?.date
      ? new Date(event.end.date).getTime()
      : null;

  if (endTime && endTime < Date.now()) {
    return null;
  }

  const dueAt = event.end?.dateTime
    ? new Date(event.end.dateTime).getTime()
    : event.end?.date
      ? new Date(event.end.date + 'T23:59:59').getTime()
      : null;

  return {
    id: `gcal_${event.id}`,
    source: 'gcal',
    title: event.summary || '(no title)',
    due_at: dueAt,
    priority: assignPriority(event, priorityKeywords),
    is_done: 0,
    raw_json: JSON.stringify(event),
    synced_at: Date.now(),
  };
}

async function fetchEvents(config) {
  const { google_calendar: gcalConfig } = config.sources;

  if (!gcalConfig.enabled) {
    return [];
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('Google Calendar: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required');
    return [];
  }

  const oAuth2Client = await getAuthenticatedClient(clientId, clientSecret);
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  const lookaheadMs = (config.sync.lookahead_hours || 72) * 3600000;
  const timeMax = new Date(Date.now() + lookaheadMs).toISOString();

  const allEvents = [];

  for (const calendarId of gcalConfig.calendars) {
    try {
      const response = await calendar.events.list({
        calendarId,
        timeMin: new Date().toISOString(),
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 50,
      });

      const events = (response.data.items || [])
        .map((event) => normalizeEvent(event, gcalConfig.priority_keywords))
        .filter((e) => e !== null);

      allEvents.push(...events);
    } catch (err) {
      console.error(`Google Calendar: error fetching ${calendarId}:`, err.message);
    }
  }

  return allEvents;
}

module.exports = {
  fetchEvents,
  normalizeEvent,
  assignPriority,
  getAuthenticatedClient,
  TOKEN_PATH,
};

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
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

const { getLookaheadEnd } = require('../core/deadline-engine');

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
    const oauthState = crypto.randomBytes(16).toString('hex');
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
      state: oauthState,
    });

    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, `http://localhost:${OAUTH_PORT}`);
        if (url.pathname !== '/oauth/callback') {
          res.writeHead(404);
          res.end();
          return;
        }

        const returnedState = url.searchParams.get('state');
        if (returnedState !== oauthState) {
          res.writeHead(403);
          res.end('Invalid OAuth state — possible CSRF attempt');
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

        clearTimeout(authTimeout);
        server.close();
        resolve(tokens);
      } catch (err) {
        res.writeHead(500);
        res.end('Authorization failed');
        clearTimeout(authTimeout);
        server.close();
        reject(err);
      }
    });

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

const MEETING_URL_PATTERN =
  /https?:\/\/(?:teams\.microsoft\.com\/[\w./?=&%-]+|[\w.-]+\.zoom\.us\/j\/[\w?=&-]+|meet\.google\.com\/[\w-]+)/i;

function extractMeetUrlFromText(text) {
  if (!text) {
    return null;
  }
  const match = text.match(MEETING_URL_PATTERN);
  return match ? match[0] : null;
}

function extractMeetUrl(event) {
  if (event.hangoutLink) {
    return event.hangoutLink;
  }
  const entryPoints = event.conferenceData?.entryPoints;
  if (Array.isArray(entryPoints)) {
    const videoEntry = entryPoints.find((ep) => ep.entryPointType === 'video' && ep.uri);
    if (videoEntry) {
      return videoEntry.uri;
    }
  }
  return extractMeetUrlFromText(event.description) || extractMeetUrlFromText(event.location);
}

function normalizeEvent(event, priorityKeywords) {
  const endTime = event.end?.dateTime
    ? new Date(event.end.dateTime).getTime()
    : event.end?.date
      ? new Date(event.end.date + 'T23:59:59').getTime()
      : null;

  if (endTime && endTime < Date.now()) {
    return null;
  }

  const allDay = !event.end?.dateTime && !!event.end?.date;
  const startAt = event.start?.dateTime
    ? new Date(event.start.dateTime).getTime()
    : event.start?.date
      ? new Date(event.start.date + 'T00:00:00').getTime()
      : null;
  const dueAt = event.end?.dateTime
    ? new Date(event.end.dateTime).getTime()
    : event.end?.date
      ? new Date(event.end.date + 'T00:00:00').getTime()
      : null;

  return {
    id: `gcal_${event.id}`,
    source: 'gcal',
    title: event.summary || '(no title)',
    start_at: startAt,
    due_at: dueAt,
    all_day: allDay,
    priority: assignPriority(event, priorityKeywords),
    is_done: 0,
    web_url: event.htmlLink || null,
    meet_url: extractMeetUrl(event),
    raw_json: JSON.stringify(event),
    synced_at: Date.now(),
  };
}

function isInvalidGrant(errorMessage) {
  return typeof errorMessage === 'string' && errorMessage.includes('invalid_grant');
}

function deleteToken() {
  try {
    fs.unlinkSync(TOKEN_PATH);
    console.log('Google Calendar: deleted expired token, will re-authenticate');
  } catch {
    // token file already gone
  }
}

async function fetchCalendarEvents(oAuth2Client, gcalConfig) {
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
  const timeMax = getLookaheadEnd().toISOString();

  const allEvents = [];
  const calendarErrors = [];

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
      calendarErrors.push({ calendarId, message: err.message });
    }
  }

  return { allEvents, calendarErrors };
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

  let oAuth2Client = await getAuthenticatedClient(clientId, clientSecret);
  let { allEvents, calendarErrors } = await fetchCalendarEvents(oAuth2Client, gcalConfig);

  const hasInvalidGrant =
    calendarErrors.length === gcalConfig.calendars.length &&
    calendarErrors.every((e) => isInvalidGrant(e.message));

  if (hasInvalidGrant) {
    console.warn('Google Calendar: token revoked/expired, re-authenticating...');
    deleteToken();
    oAuth2Client = await getAuthenticatedClient(clientId, clientSecret);
    ({ allEvents, calendarErrors } = await fetchCalendarEvents(oAuth2Client, gcalConfig));
  }

  if (calendarErrors.length === gcalConfig.calendars.length) {
    throw new Error(
      `All calendars failed: ${calendarErrors.map((e) => `${e.calendarId}: ${e.message}`).join('; ')}`,
    );
  }

  return allEvents;
}

async function listCalendars(config) {
  const { google_calendar: gcalConfig } = config.sources;
  if (!gcalConfig.enabled) {
    return [];
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return [];
  }

  const oAuth2Client = await getAuthenticatedClient(clientId, clientSecret);
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
  const response = await calendar.calendarList.list();

  return (response.data.items || [])
    .filter(function (cal) {
      return cal.accessRole === 'owner' || cal.accessRole === 'writer';
    })
    .map(function (cal) {
      return { id: cal.id, summary: cal.summary || cal.id, accessRole: cal.accessRole };
    });
}

async function createEvent(config, { calendarId, summary, startTime, durationMinutes }) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required');
  }

  const oAuth2Client = await getAuthenticatedClient(clientId, clientSecret);
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  const start = new Date(startTime);
  if (isNaN(start.getTime())) {
    throw new Error('Invalid startTime');
  }
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const response = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary,
      start: { dateTime: start.toISOString() },
      end: { dateTime: end.toISOString() },
    },
  });

  return { id: response.data.id, htmlLink: response.data.htmlLink };
}

async function updateEvent(config, { calendarId, eventId, endTime }) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET required');
  }

  const end = new Date(endTime);
  if (isNaN(end.getTime())) {
    throw new Error('Invalid endTime');
  }

  const oAuth2Client = await getAuthenticatedClient(clientId, clientSecret);
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

  const response = await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: {
      end: { dateTime: end.toISOString() },
    },
  });

  return { id: response.data.id, htmlLink: response.data.htmlLink };
}

module.exports = {
  fetchEvents,
  normalizeEvent,
  assignPriority,
  extractMeetUrl,
  getAuthenticatedClient,
  listCalendars,
  createEvent,
  updateEvent,
  isInvalidGrant,
  deleteToken,
  fetchCalendarEvents,
  TOKEN_PATH,
};

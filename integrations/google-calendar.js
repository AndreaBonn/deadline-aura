'use strict';

const { google } = require('googleapis');
const {
  getAuthenticatedClient,
  resolveGoogleOAuth,
  isInvalidGrant,
  deleteToken,
} = require('./google-auth');

const { getLookaheadEnd } = require('../core/deadline-engine');
const { eventBoundaryMs, extractMeetUrl } = require('../core/event-fields');

const PRIORITY_KEYWORDS_DEFAULT = ['urgent', 'deadline', 'release', 'deploy', 'critico'];
const RED_COLOR_ID = '11';

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

function isDeclinedByUser(event) {
  if (!Array.isArray(event.attendees)) {
    return false;
  }
  const selfAttendee = event.attendees.find((a) => a.self === true);
  return selfAttendee?.responseStatus === 'declined';
}

// An all-day event counts as ended only after its last second, not at midnight.
function isSkippedEvent(event) {
  const endTime = event.end?.dateTime
    ? new Date(event.end.dateTime).getTime()
    : event.end?.date
      ? new Date(event.end.date + 'T23:59:59').getTime()
      : null;
  if (endTime && endTime < Date.now()) {
    return true;
  }
  return event.status === 'cancelled' || isDeclinedByUser(event);
}

function normalizeEvent(event, priorityKeywords) {
  if (isSkippedEvent(event)) {
    return null;
  }

  const allDay = !event.end?.dateTime && !!event.end?.date;
  const startAt = eventBoundaryMs(event.start);
  const dueAt = eventBoundaryMs(event.end);

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

  const { clientId, clientSecret } = resolveGoogleOAuth(config);

  if (!clientId || !clientSecret) {
    console.error('Google Calendar: client_id and client_secret required (settings or env)');
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

  const { clientId, clientSecret } = resolveGoogleOAuth(config);
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
  const { clientId, clientSecret } = resolveGoogleOAuth(config);
  if (!clientId || !clientSecret) {
    throw new Error('Google client_id and client_secret required (settings or env)');
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
  const { clientId, clientSecret } = resolveGoogleOAuth(config);
  if (!clientId || !clientSecret) {
    throw new Error('Google client_id and client_secret required (settings or env)');
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
  eventBoundaryMs,
  isDeclinedByUser,
  assignPriority,
  extractMeetUrl,
  listCalendars,
  createEvent,
  updateEvent,
  fetchCalendarEvents,
};

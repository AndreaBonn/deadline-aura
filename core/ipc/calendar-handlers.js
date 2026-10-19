'use strict';

const {
  validateCalendarLogTime,
  validateCalendarUpdateEvent,
} = require('../calendar-ipc-validation');

function failure(channel, err) {
  console.error(`${channel} error:`, err.message);
  return { ok: false, error: err.message };
}

function eventResult(result) {
  return { ok: true, eventId: result.id, htmlLink: result.htmlLink };
}

const defaultCalendar = (getConfig) => getConfig().sources.google_calendar.default_log_calendar;

function listCalendars({ gcal, getConfig }) {
  return async () => {
    try {
      return { ok: true, calendars: await gcal.listCalendars(getConfig()) };
    } catch (err) {
      return failure('calendar:list', err);
    }
  };
}

function setDefault({ getConfig, saveConfig }) {
  return (calendarId) => {
    if (!calendarId || typeof calendarId !== 'string') {
      return { ok: false, error: 'INVALID_CALENDAR_ID' };
    }
    const config = getConfig();
    config.sources.google_calendar.default_log_calendar = calendarId;
    saveConfig(config);
    return { ok: true };
  };
}

function logTime({ gcal, getConfig }) {
  return async ({ summary, startTime, durationMinutes, calendarId }) => {
    const error = validateCalendarLogTime({ summary, startTime, durationMinutes });
    if (error) {
      return { ok: false, error };
    }
    const targetCalendar = calendarId || defaultCalendar(getConfig);
    if (!targetCalendar) {
      return { ok: false, error: 'NO_CALENDAR_SELECTED' };
    }
    try {
      const event = { calendarId: targetCalendar, summary, startTime, durationMinutes };
      return eventResult(await gcal.createEvent(getConfig(), event));
    } catch (err) {
      return failure('calendar:log-time', err);
    }
  };
}

function updateEvent({ gcal, getConfig }) {
  return async ({ calendarId, eventId, endTime }) => {
    const error = validateCalendarUpdateEvent({ calendarId, eventId, endTime });
    if (error) {
      return { ok: false, error };
    }
    try {
      return eventResult(await gcal.updateEvent(getConfig(), { calendarId, eventId, endTime }));
    } catch (err) {
      return failure('calendar:update-event', err);
    }
  };
}

/**
 * Build the Google Calendar IPC handlers.
 * @param {object} deps - Injected dependencies.
 * @param {object} deps.gcal - Calendar client (listCalendars, createEvent, updateEvent).
 * @param {Function} deps.getConfig - Returns the current config, read at every call.
 * @param {Function} deps.saveConfig - Persists the config object.
 * @returns {Object<string, Function>} Channel -> handler(payload).
 */
function createCalendarHandlers(deps) {
  return {
    'calendar:list': listCalendars(deps),
    'calendar:get-default': () => ({ ok: true, calendarId: defaultCalendar(deps.getConfig) || '' }),
    'calendar:set-default': setDefault(deps),
    'calendar:log-time': logTime(deps),
    'calendar:update-event': updateEvent(deps),
  };
}

module.exports = { createCalendarHandlers };

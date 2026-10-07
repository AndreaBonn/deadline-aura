'use strict';

const MIN_DURATION_MINUTES = 1;

/**
 * Validate time logging fields without resolving the destination calendar.
 * @param {object} input - Event fields received through IPC.
 * @returns {string|null} The first validation error, or null for valid fields.
 */
function validateCalendarLogTime({ summary, startTime, durationMinutes }) {
  if (!summary || typeof summary !== 'string') {
    return 'INVALID_SUMMARY';
  }
  if (!startTime || typeof durationMinutes !== 'number' || durationMinutes < MIN_DURATION_MINUTES) {
    return 'INVALID_TIME';
  }
  return null;
}

/**
 * Validate event updates, retaining the IPC contract's truthy time check.
 * @param {object} input - Event fields received through IPC.
 * @returns {string|null} The first validation error, or null for valid fields.
 */
function validateCalendarUpdateEvent({ calendarId, eventId, endTime }) {
  if (!calendarId || typeof calendarId !== 'string') {
    return 'INVALID_CALENDAR_ID';
  }
  if (!eventId || typeof eventId !== 'string') {
    return 'INVALID_EVENT_ID';
  }
  if (!endTime) {
    return 'INVALID_END_TIME';
  }
  return null;
}

module.exports = { validateCalendarLogTime, validateCalendarUpdateEvent };

'use strict';

// Sources whose tasks are calendar events: committed blocks of time with a
// start, as opposed to backlog items that only carry a due date. Several parts
// of the app branch on this distinction — pressure volume, AI prompt sections,
// wallpaper badges, post-it codes — and each of them used to hardcode 'gcal',
// which meant a second calendar source would have been silently counted as
// backlog and weighted down.
const CALENDAR_SOURCES = ['gcal', 'outlook'];

// SQL fragment for `source IN (...)` clauses.
const CALENDAR_SOURCES_SQL = CALENDAR_SOURCES.map((source) => `'${source}'`).join(', ');

/**
 * Tell whether a task comes from a calendar source.
 *
 * @param {string} source - Task source column.
 * @returns {boolean} True for calendar events.
 */
function isCalendarSource(source) {
  return CALENDAR_SOURCES.includes(source);
}

module.exports = { CALENDAR_SOURCES, CALENDAR_SOURCES_SQL, isCalendarSource };

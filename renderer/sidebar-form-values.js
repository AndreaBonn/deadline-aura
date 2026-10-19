'use strict';

const LOG_QUARTER_MINUTES = 15;

function readTaskFormValues({ title, date, priority }) {
  const trimmedTitle = title.trim();
  if (!trimmedTitle) {
    return { error: 'title' };
  }
  return {
    title: trimmedTitle,
    dueAt: date ? new Date(date).getTime() : null,
    priority: parseInt(priority, 10),
  };
}

function toDateTimeLocalValue(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate()) +
    'T' +
    pad(date.getHours()) +
    ':' +
    pad(date.getMinutes())
  );
}

function defaultLogStart(now) {
  const rounded = new Date(now.getTime());
  rounded.setMinutes(
    Math.floor(rounded.getMinutes() / LOG_QUARTER_MINUTES) * LOG_QUARTER_MINUTES,
    0,
    0,
  );
  return toDateTimeLocalValue(rounded);
}

function validateTimeLog({ duration, calendarId, date, time }) {
  const minutes = parseInt(duration, 10);
  if (!minutes || minutes < 1) {
    return { error: 'sidebar.error_duration', field: 'duration' };
  }
  if (!calendarId) {
    return { error: 'sidebar.error_calendar', field: 'calendar' };
  }
  const start = new Date(date + 'T' + time + ':00');
  if (Number.isNaN(start.getTime())) {
    return { error: 'sidebar.error_start', field: 'date' };
  }
  return { duration: minutes, calendarId, startTime: start.toISOString() };
}

if (typeof module !== 'undefined') {
  module.exports = { readTaskFormValues, toDateTimeLocalValue, defaultLogStart, validateTimeLog };
}

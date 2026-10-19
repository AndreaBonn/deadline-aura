'use strict';

const LOG_QUARTER_MINUTES = 15;
const DEFAULT_NEW_TASK_PRIORITY = 3;

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

/**
 * Priority choices for the task forms, with the one to preselect.
 *
 * @param {{priority: number}|null} task - Task being edited, or null when adding.
 * @returns {{value: string, selected: boolean}[]} P1 to P4; the task's priority, or P3 for a new task.
 */
function priorityOptions(task) {
  const preselected = String(task ? task.priority : DEFAULT_NEW_TASK_PRIORITY);
  return ['1', '2', '3', '4'].map((value) => ({ value, selected: value === preselected }));
}

if (typeof module !== 'undefined') {
  module.exports = {
    readTaskFormValues,
    toDateTimeLocalValue,
    defaultLogStart,
    validateTimeLog,
    priorityOptions,
  };
}

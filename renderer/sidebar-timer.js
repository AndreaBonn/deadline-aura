'use strict';

function parseStoredTimer(raw) {
  try {
    const saved = JSON.parse(raw);
    if (
      saved &&
      saved.taskId &&
      saved.startTime &&
      saved.eventId &&
      saved.calendarId &&
      typeof saved.summary === 'string'
    ) {
      return saved;
    }
    return null;
  } catch {
    return null;
  }
}

function createTimerState(task, { startTime, calendarId, summary }) {
  return { taskId: task.id, startTime, calendarId, eventId: null, summary };
}

if (typeof module !== 'undefined') {
  module.exports = { parseStoredTimer, createTimerState };
}

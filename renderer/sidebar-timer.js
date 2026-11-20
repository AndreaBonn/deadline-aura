'use strict';

const TIMER_STORAGE_KEY = 'deadlineaura_active_timer';
const TIMER_UPDATE_INTERVAL_MS = 60 * 1000;
const TIMER_DEFAULT_DURATION_MIN = 30;
const TIMER_UI_TICK_MS = 1000;
const TIMER_LOGGED_BADGE_MS = 3000;
// How long stop() waits for slow periodic updates before writing the final end time anyway.
const TIMER_STOP_WAIT_MS = 5000;

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

// Running-timer lifecycle. Side effects come in through `deps`: state, storage, getApi, now,
// rerender, summaryFor (task -> event summary), formatElapsed, root (document).
class TimerController {
  constructor(deps) {
    this.deps = deps;
    // Periodic end-time updates still in flight: stop() writes its final end time after them,
    // so a slow tick cannot move the end of a stopped timer back by up to a minute.
    this.ticksInFlight = new Set();
    this.badgeTimeout = null;
  }

  save() {
    const { state, storage } = this.deps;
    if (state.activeTimer) {
      storage.setItem(TIMER_STORAGE_KEY, JSON.stringify(state.activeTimer));
    } else {
      storage.removeItem(TIMER_STORAGE_KEY);
    }
  }

  restore() {
    const { state, storage } = this.deps;
    try {
      const raw = storage.getItem(TIMER_STORAGE_KEY);
      const saved = parseStoredTimer(raw);
      if (saved) {
        state.activeTimer = saved;
        this.startIntervals();
      } else if (raw) {
        console.error('stored timer is not valid, discarded:', raw);
        storage.removeItem(TIMER_STORAGE_KEY);
      }
    } catch {
      storage.removeItem(TIMER_STORAGE_KEY);
    }
  }

  startIntervals() {
    this.clearIntervals();
    const { state } = this.deps;
    state.timerUiInterval = setInterval(() => this.updateDisplay(), TIMER_UI_TICK_MS);
    state.timerSyncInterval = setInterval(() => this.sync(), TIMER_UPDATE_INTERVAL_MS);
  }

  clearIntervals() {
    const { state } = this.deps;
    for (const key of ['timerUiInterval', 'timerSyncInterval']) {
      if (state[key]) {
        clearInterval(state[key]);
        state[key] = null;
      }
    }
  }

  updateDisplay() {
    const { state, root, formatElapsed: format } = this.deps;
    if (!state.activeTimer) {
      return;
    }
    const el = root.querySelector(
      '.timer-elapsed[data-task-id="' + state.activeTimer.taskId + '"]',
    );
    if (el) {
      el.textContent = format(state.activeTimer.startTime);
    }
  }

  sync() {
    const { state, getApi, now } = this.deps;
    if (!state.activeTimer || !state.activeTimer.eventId) {
      return;
    }
    const tick = getApi()
      .updateCalendarEvent({
        calendarId: state.activeTimer.calendarId,
        eventId: state.activeTimer.eventId,
        endTime: now().toISOString(),
      })
      .then(
        (result) => {
          if (!result || !result.ok) {
            console.error('timer sync failed:', result?.error);
          }
        },
        (err) => console.error('timer sync failed:', err.message),
      );
    this.ticksInFlight.add(tick);
    tick.finally(() => this.ticksInFlight.delete(tick));
  }

  // A picker opened by an earlier click of the same burst must not stay open.
  closePicker() {
    if (this.deps.state.timerPickerTaskId !== null) {
      this.deps.state.timerPickerTaskId = null;
      this.deps.rerender();
    }
  }

  // Only one timer runs: a second start on the same task (a double click, a picker opened
  // twice) is ignored, a start on another task first stops the running one.
  start(task, calendarId) {
    const { state, getApi, now, summaryFor } = this.deps;
    if (state.activeTimer) {
      if (state.activeTimer.taskId === task.id) {
        this.closePicker();
        return Promise.resolve();
      }
      this.stop();
    }
    const summary = summaryFor(task);
    const startTime = now().toISOString();
    const timer = createTimerState(task, { startTime, calendarId, summary });
    state.activeTimer = timer;
    this.save();
    state.timerPickerTaskId = null;
    this.deps.rerender();
    return getApi()
      .logTimeToCalendar({
        summary,
        startTime,
        durationMinutes: TIMER_DEFAULT_DURATION_MIN,
        calendarId,
      })
      .then(
        (result) => this.onEventLogged(result, timer),
        (err) => this.onEventLogged({ ok: false, error: err.message }, timer),
      );
  }

  // `timer` is the state object start() created: by the time the calendar answers it may have
  // been stopped (or replaced by a newer timer), and the answer belongs to it either way.
  onEventLogged(result, timer) {
    const { state, getApi } = this.deps;
    if (state.activeTimer !== timer) {
      this.closeEventOfStoppedTimer(result, timer);
      return;
    }
    if (result.ok && result.eventId) {
      state.activeTimer.eventId = result.eventId;
      this.save();
      // A preference: failing to store it must not disturb the running timer.
      Promise.resolve(getApi().setDefaultLogCalendar(timer.calendarId)).catch((err) =>
        console.error('saving the default calendar failed:', err.message),
      );
      this.startIntervals();
      return;
    }
    console.error('timer start failed:', result.error);
    state.activeTimer = null;
    this.save();
    this.clearIntervals();
    this.deps.rerender();
  }

  // stop() ran before the event existed: close the event the calendar just created at the
  // moment of the stop, as stop() would have, so it is not left at the default 30 minutes.
  closeEventOfStoppedTimer(result, timer) {
    if (!result.ok || !result.eventId) {
      console.error('late timer answer has no event to close:', result.error);
      return;
    }
    this.deps
      .getApi()
      .updateCalendarEvent({
        calendarId: timer.calendarId,
        eventId: result.eventId,
        endTime: timer.stoppedAt,
      })
      .then(
        (closed) => {
          if (!closed || !closed.ok) {
            console.error('closing the late timer event failed:', closed?.error);
          }
        },
        (err) => console.error('closing the late timer event failed:', err.message),
      );
  }

  stop() {
    const { state, now } = this.deps;
    if (!state.activeTimer) {
      return Promise.resolve();
    }
    const timer = state.activeTimer;
    this.clearIntervals();
    state.activeTimer = null;
    this.save();

    if (!timer.eventId) {
      timer.stoppedAt = now().toISOString();
      this.deps.rerender();
      return Promise.resolve();
    }
    return this.closeEvent(timer, now().toISOString());
  }

  // After the periodic updates still in flight, so the final end time is the last one written;
  // an update that never answers delays it by TIMER_STOP_WAIT_MS at most.
  waitForTicks() {
    let timeout;
    const limit = new Promise((resolve) => (timeout = setTimeout(resolve, TIMER_STOP_WAIT_MS)));
    return Promise.race([Promise.all(this.ticksInFlight), limit]).finally(() =>
      clearTimeout(timeout),
    );
  }

  closeEvent(timer, endTime) {
    return this.waitForTicks()
      .then(() =>
        this.deps.getApi().updateCalendarEvent({
          calendarId: timer.calendarId,
          eventId: timer.eventId,
          endTime,
        }),
      )
      .then(
        (result) =>
          result && result.ok
            ? this.showLoggedBadge(timer.taskId)
            : this.reportStopFailure(result?.error),
        (err) => this.reportStopFailure(err.message),
      );
  }

  // The timer is already cleared: repaint the card, but do not claim the time was logged.
  reportStopFailure(message) {
    console.error('timer stop failed:', message);
    this.deps.rerender();
  }

  showLoggedBadge(taskId) {
    const { state } = this.deps;
    state.temporaryLoggedTaskId = taskId;
    this.deps.rerender();
    clearTimeout(this.badgeTimeout);
    this.badgeTimeout = setTimeout(() => {
      this.badgeTimeout = null;
      state.temporaryLoggedTaskId = null;
      this.deps.rerender();
    }, TIMER_LOGGED_BADGE_MS);
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    parseStoredTimer,
    createTimerState,
    TimerController,
  };
}

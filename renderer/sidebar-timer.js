'use strict';

/* global t, sidebarState, rerender, timerController, formatElapsed, extractJiraKey,
   createIcon, createIconButton, createJiraKeyPicker, createLabelledField,
   createFormError, loadCalendarOptions, createTimeLogElement */

const TIMER_STORAGE_KEY = 'deadlineaura_active_timer';
const TIMER_UPDATE_INTERVAL_MS = 60 * 1000;
const TIMER_DEFAULT_DURATION_MIN = 30;
const TIMER_UI_TICK_MS = 1000;
const TIMER_LOGGED_BADGE_MS = 3000;

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
    getApi()
      .updateCalendarEvent({
        calendarId: state.activeTimer.calendarId,
        eventId: state.activeTimer.eventId,
        endTime: now().toISOString(),
      })
      .catch(function (err) {
        console.error('timer sync failed:', err.message);
      });
  }

  start(task, calendarId) {
    const { state, getApi, now, summaryFor } = this.deps;
    const summary = summaryFor(task);
    const startTime = now().toISOString();
    state.activeTimer = createTimerState(task, { startTime, calendarId, summary });
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
      .then((result) => this.onEventLogged(result, calendarId));
  }

  onEventLogged(result, calendarId) {
    const { state, getApi } = this.deps;
    if (result.ok && result.eventId) {
      state.activeTimer.eventId = result.eventId;
      this.save();
      getApi().setDefaultLogCalendar(calendarId);
      this.startIntervals();
      return;
    }
    state.activeTimer = null;
    this.save();
    this.clearIntervals();
    this.deps.rerender();
  }

  stop() {
    const { state, getApi, now } = this.deps;
    if (!state.activeTimer) {
      return Promise.resolve();
    }
    const timer = state.activeTimer;
    this.clearIntervals();
    state.activeTimer = null;
    this.save();

    if (!timer.eventId) {
      this.deps.rerender();
      return Promise.resolve();
    }
    return getApi()
      .updateCalendarEvent({
        calendarId: timer.calendarId,
        eventId: timer.eventId,
        endTime: now().toISOString(),
      })
      .then(() => this.showLoggedBadge(timer.taskId));
  }

  showLoggedBadge(taskId) {
    const { state } = this.deps;
    state.temporaryLoggedTaskId = taskId;
    this.deps.rerender();
    setTimeout(() => {
      state.temporaryLoggedTaskId = null;
      this.deps.rerender();
    }, TIMER_LOGGED_BADGE_MS);
  }
}

function createTimerButton(task) {
  const active = sidebarState.activeTimer;
  if (active && active.taskId === task.id) {
    return createTimerStopButton(task, active);
  }
  const isOtherTimerActive = Boolean(active);
  return createIconButton({
    icon: 'play',
    label: t('sidebar.timer_start'),
    className: 'timer-play-btn' + (isOtherTimerActive ? ' disabled' : ''),
    onClick: function () {
      if (isOtherTimerActive) {
        timerController.stop();
      }
      handlePlayClick(task);
    },
  });
}

function createTimerStopButton(task, active) {
  const stopBtn = Object.assign(document.createElement('button'), {
    type: 'button',
    className: 'timer-stop-btn',
    title: t('sidebar.timer_stop'),
  });
  stopBtn.setAttribute('aria-label', t('sidebar.timer_stop'));
  const elapsed = Object.assign(document.createElement('span'), {
    className: 'timer-elapsed',
    textContent: formatElapsed(active.startTime),
  });
  elapsed.dataset.taskId = task.id;
  stopBtn.append(createIcon('stop'), elapsed);
  stopBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    timerController.stop();
  });
  return stopBtn;
}

function handlePlayClick(task) {
  window.deadlineAura.getDefaultLogCalendar().then(function (result) {
    if (result.ok && result.calendarId) {
      timerController.start(task, result.calendarId);
    } else {
      sidebarState.timerPickerTaskId = sidebarState.timerPickerTaskId === task.id ? null : task.id;
      rerender();
    }
  });
}

function createTimerCalendarPicker(task) {
  const form = createTimeLogElement('div', 'timer-picker-form');
  const idBase = 'tp-' + String(task.id).replace(/[^a-zA-Z0-9_-]/g, '_');

  form.appendChild(
    createTimeLogElement('div', 'time-log-header', t('sidebar.timer_select_calendar')),
  );

  let picker = null;
  if (task.source === 'local' && !extractJiraKey(task.title)) {
    picker = createJiraKeyPicker(task, function () {});
    form.appendChild(picker.element);
  }

  const calendarSelect = createTimeLogElement('select', 'time-log-calendar-select');
  loadCalendarOptions(calendarSelect);
  form.appendChild(
    createLabelledField(t('sidebar.label_calendar'), calendarSelect, idBase + '-calendar'),
  );

  const error = createFormError();
  form.appendChild(createTimerPickerActions(task, { calendarSelect, picker, error }));
  form.appendChild(error.element);
  return form;
}

function createTimerPickerActions(task, parts) {
  const row = createTimeLogElement('div', 'time-log-row time-log-actions');
  const startBtn = createTimeLogElement('button', 'timer-start-btn', t('sidebar.timer_start'));
  startBtn.type = 'button';
  startBtn.addEventListener('click', () => startFromPicker(task, parts));
  row.appendChild(startBtn);

  row.appendChild(
    createIconButton({
      icon: 'close',
      label: t('common.cancel'),
      onClick: function () {
        sidebarState.timerPickerTaskId = null;
        rerender();
      },
    }),
  );
  return row;
}

function startFromPicker(task, { calendarSelect, picker, error }) {
  error.clear();
  const calId = calendarSelect.value;
  if (!calId) {
    error.show(t('sidebar.error_calendar'));
    calendarSelect.focus();
    return;
  }
  const key = picker ? picker.getKey() : null;
  const timedTask = key
    ? Object.assign({}, task, { title: '[' + key + '] - ' + task.title })
    : task;
  timerController.start(timedTask, calId);
}

if (typeof module !== 'undefined') {
  module.exports = {
    parseStoredTimer,
    createTimerState,
    TimerController,
    createTimerButton,
    createTimerCalendarPicker,
  };
}

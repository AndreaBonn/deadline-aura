'use strict';

/* global t, sidebarState, rerender, timerController, formatElapsed, extractJiraKey,
   createIcon, createIconButton, createJiraKeyPicker, createLabelledField,
   createFormError, loadCalendarOptions, createTimeLogElement */

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
  module.exports = { createTimerButton, createTimerCalendarPicker };
}

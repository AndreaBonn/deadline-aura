'use strict';

/* global t, _i18nReady, initI18n, formatElapsed, localStorage,
   updateShiftCountdown, setShiftConfig, extractJiraKey, buildEventSummary,
   priorityKey, formatScore100, flybyStateKey, formatSyncStatus,
   urgencyToTextColor, buildScoreBreakdownHtml, groupTasksForSections,
   createIcon, createIconButton, createActionMenu, createUndoToast, createStartCard */

const COLLAPSED_LIMIT = 5;
const COLOR_ONGOING = '#4fc3f7';
const COLOR_ENDED = '#888';

let jiraFilter = '';
let lastTasks = null;
let lastPalette = null;
let pinnedTaskIds = new Set();
let favoriteTaskIds = new Set();
let timeLogTaskId = null;
let temporaryLoggedTaskId = null;
let cachedCalendars = null;
// Time logging and the live timer write to Google Calendar: without it they cannot work.
let googleCalendarReady = true;

// --- Live timer state ---
const TIMER_STORAGE_KEY = 'deadlineaura_active_timer';
const TIMER_UPDATE_INTERVAL_MS = 60 * 1000;
const TIMER_DEFAULT_DURATION_MIN = 30;

let activeTimer = null; // { taskId, startTime, calendarId, eventId, summary }
let timerUiInterval = null;
let timerSyncInterval = null;
let timerPickerTaskId = null; // task id showing calendar picker before play

function saveTimerState() {
  if (activeTimer) {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(activeTimer));
  } else {
    localStorage.removeItem(TIMER_STORAGE_KEY);
  }
}

function restoreTimerState() {
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) {
      return;
    }
    const saved = JSON.parse(raw);
    if (saved && saved.taskId && saved.startTime && saved.eventId) {
      activeTimer = saved;
      startTimerIntervals();
    }
  } catch (err) {
    void err;
    localStorage.removeItem(TIMER_STORAGE_KEY);
  }
}

function startTimerIntervals() {
  clearTimerIntervals();
  timerUiInterval = setInterval(function () {
    updateTimerDisplay();
  }, 1000);
  timerSyncInterval = setInterval(function () {
    syncTimerToCalendar();
  }, TIMER_UPDATE_INTERVAL_MS);
}

function clearTimerIntervals() {
  if (timerUiInterval) {
    clearInterval(timerUiInterval);
    timerUiInterval = null;
  }
  if (timerSyncInterval) {
    clearInterval(timerSyncInterval);
    timerSyncInterval = null;
  }
}

function updateTimerDisplay() {
  if (!activeTimer) {
    return;
  }
  const el = document.querySelector('.timer-elapsed[data-task-id="' + activeTimer.taskId + '"]');
  if (el) {
    el.textContent = formatElapsed(activeTimer.startTime);
  }
}

function syncTimerToCalendar() {
  if (!activeTimer || !activeTimer.eventId) {
    return;
  }
  window.deadlineAura
    .updateCalendarEvent({
      calendarId: activeTimer.calendarId,
      eventId: activeTimer.eventId,
      endTime: new Date().toISOString(),
    })
    .catch(function (err) {
      console.error('timer sync failed:', err.message);
    });
}

function startTimer(task, calendarId) {
  const jiraKey = extractJiraKey(task.title);
  const summary = buildEventSummary(jiraKey, task.title);
  const startTime = new Date().toISOString();

  activeTimer = {
    taskId: task.id,
    startTime: startTime,
    calendarId: calendarId,
    eventId: null,
    summary: summary,
  };
  saveTimerState();
  timerPickerTaskId = null;
  renderTaskList(lastTasks, lastPalette);

  window.deadlineAura
    .logTimeToCalendar({
      summary: summary,
      startTime: startTime,
      durationMinutes: TIMER_DEFAULT_DURATION_MIN,
      calendarId: calendarId,
    })
    .then(function (result) {
      if (result.ok && result.eventId) {
        activeTimer.eventId = result.eventId;
        saveTimerState();
        window.deadlineAura.setDefaultLogCalendar(calendarId);
        startTimerIntervals();
      } else {
        activeTimer = null;
        saveTimerState();
        clearTimerIntervals();
        renderTaskList(lastTasks, lastPalette);
      }
    });
}

function stopTimer() {
  if (!activeTimer) {
    return;
  }
  const timer = activeTimer;
  clearTimerIntervals();
  activeTimer = null;
  saveTimerState();

  if (timer.eventId) {
    window.deadlineAura
      .updateCalendarEvent({
        calendarId: timer.calendarId,
        eventId: timer.eventId,
        endTime: new Date().toISOString(),
      })
      .then(function () {
        temporaryLoggedTaskId = timer.taskId;
        renderTaskList(lastTasks, lastPalette);
        setTimeout(function () {
          temporaryLoggedTaskId = null;
          renderTaskList(lastTasks, lastPalette);
        }, 3000);
      });
  } else {
    renderTaskList(lastTasks, lastPalette);
  }
}

// Latest known flyby state, kept in sync via getFlybyState / onConfigChanged.
let _flybyState = { enabled: true, snoozed_until: null };

/**
 * Whether the flyby is suppressed right now. Mirrors the canonical rule in
 * core/flyby-snooze.js isFlybySuppressed(); the renderer sandbox (no require,
 * CSP script-src 'self') cannot share that module, so the two-term predicate is
 * duplicated here. Keep both in sync if the rule changes.
 *
 * @param {{enabled: boolean, snoozed_until: number|null}} state - Flyby state.
 * @param {number} now - Current epoch ms.
 * @returns {boolean} True when the flyby should not launch.
 */
function isFlybySuppressed(state, now) {
  if (!state.enabled) {
    return true;
  }
  return typeof state.snoozed_until === 'number' && now < state.snoozed_until;
}

/**
 * Reflect the flyby state on the cat button: crossed out (is-snoozed) when the
 * flyby is suppressed (disabled or snoozed), normal otherwise. Recomputed every
 * clock tick so an expired snooze clears the slash without waiting for a config
 * broadcast.
 */
function applyFlybyIcon() {
  const toggle = document.getElementById('flybyToggle');
  if (!toggle) {
    return;
  }
  const now = Date.now();
  const suppressed = isFlybySuppressed(_flybyState, now);
  toggle.classList.toggle('is-snoozed', suppressed);
  // "Reactivate" only makes sense when something is suspended.
  const reactivate = document.querySelector('.flyby-menu-item--reactivate');
  if (reactivate) {
    reactivate.hidden = !suppressed;
  }
  if (_i18nReady) {
    toggle.setAttribute('aria-label', t(suppressed ? 'flyby_menu.suspended' : 'flyby_menu.active'));
    const stateEl = document.getElementById('flybyMenuState');
    if (stateEl) {
      const until = _flybyState.snoozed_until
        ? new Date(_flybyState.snoozed_until).toLocaleString([], {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';
      stateEl.textContent = t(flybyStateKey(_flybyState, now), { time: until });
    }
  }
}

function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('clock').textContent = `${h}:${m}`;

  const rawLocale = _i18nReady ? t('meta.dateLocale') : 'it-IT';
  const locale = rawLocale.includes('-') ? rawLocale : 'it-IT';
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  document.getElementById('clockDate').textContent = now.toLocaleDateString(locale, options);
  updateShiftCountdown();
  applyFlybyIcon();
}

function renderUrgencyBar(globalScore, palette) {
  const bar = document.getElementById('urgencyBar');
  bar.style.width = `${globalScore * 100}%`;
  bar.style.backgroundColor = palette.accent_hex;

  document.getElementById('urgencyLabel').textContent = palette.label;
  const scoreEl = document.getElementById('urgencyScore');
  scoreEl.textContent = formatScore100(globalScore);
  // The exact value stays available to whoever tunes the thresholds.
  scoreEl.title = globalScore.toFixed(2);
}

function renderActiveTimerSection(container, tasks, palette) {
  if (!activeTimer) {
    return;
  }
  const timerTask = tasks.find(function (task) {
    return task.id === activeTimer.taskId;
  });
  if (!timerTask) {
    return;
  }

  const label = document.createElement('div');
  label.className = 'section-label active-timer-label';
  label.textContent = t('sidebar.in_progress');
  container.appendChild(label);

  const card = createTaskCard(timerTask, palette);
  container.appendChild(card);
}

function renderTaskList(tasks, palette) {
  const container = document.getElementById('tasksContainer');

  const searchFocused =
    document.activeElement && document.activeElement.classList.contains('jira-search');
  const cursorPos = searchFocused ? document.activeElement.selectionStart : 0;

  container.innerHTML = '';

  lastTasks = tasks;
  lastPalette = palette;

  if (pendingDelete) {
    container.appendChild(
      createUndoToast(
        t('sidebar.deleted_toast', { title: pendingDelete.task.title }),
        t('sidebar.undo'),
        undoPendingDelete,
      ),
    );
  }

  const {
    visibleTasks,
    isEmpty,
    gcal: gcalTasks,
    outlook: outlookTasks,
    jira: jiraTasks,
    local: localTasks,
    gtasks: gtasksTasks,
    favorites: favoriteTasks,
  } = groupTasksForSections(tasks, {
    pendingDeleteId: pendingDelete ? pendingDelete.task.id : null,
    favoriteIds: favoriteTaskIds,
    jiraFilter,
  });

  renderActiveTimerSection(container, visibleTasks, palette);
  if (isEmpty && !addFormVisible) {
    container.appendChild(
      createStartCard({
        onNewTask: openQuickAdd,
        onOpenSettings: function () {
          window.deadlineAura.openConfig();
        },
      }),
    );
  }
  renderLocalSection(container, localTasks, palette, isEmpty);
  if (gtasksTasks.length > 0) {
    renderSection(container, t('sidebar.google_tasks'), gtasksTasks, palette, 'gtasks');
  }
  if (gcalTasks.length > 0) {
    renderSection(container, t('sidebar.google_calendar'), gcalTasks, palette, 'gcal');
  }
  if (outlookTasks.length > 0) {
    renderSection(container, t('sidebar.outlook'), outlookTasks, palette, 'outlook');
  }
  if (favoriteTasks.length > 0) {
    renderSection(container, t('sidebar.jira_favorites'), favoriteTasks, palette, 'jira_favorites');
  }
  if (jiraTasks.length > 0 || jiraFilter) {
    renderJiraSection(container, jiraTasks, palette);
  }

  if (searchFocused) {
    const newInput = container.querySelector('.jira-search');
    if (newInput) {
      newInput.focus();
      newInput.setSelectionRange(cursorPos, cursorPos);
    }
  }
}

function createEditForm(task) {
  const form = document.createElement('div');
  form.className = 'task-card edit-form-card';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'quick-add-input';
  titleInput.value = task.title;

  const row = document.createElement('div');
  row.className = 'quick-add-row';

  const dateInput = document.createElement('input');
  dateInput.type = 'datetime-local';
  dateInput.className = 'quick-add-date';
  if (task.due_at) {
    const d = new Date(task.due_at);
    const pad = function (n) {
      return String(n).padStart(2, '0');
    };
    dateInput.value =
      d.getFullYear() +
      '-' +
      pad(d.getMonth() + 1) +
      '-' +
      pad(d.getDate()) +
      'T' +
      pad(d.getHours()) +
      ':' +
      pad(d.getMinutes());
  }

  const prioritySelect = document.createElement('select');
  prioritySelect.className = 'quick-add-priority';
  const priorities = [
    { value: '1', label: 'P1' },
    { value: '2', label: 'P2' },
    { value: '3', label: 'P3' },
    { value: '4', label: 'P4' },
  ];
  for (let i = 0; i < priorities.length; i++) {
    const opt = document.createElement('option');
    opt.value = priorities[i].value;
    opt.textContent = priorities[i].label;
    if (String(task.priority) === priorities[i].value) {
      opt.selected = true;
    }
    prioritySelect.appendChild(opt);
  }

  const saveBtn = document.createElement('button');
  saveBtn.className = 'quick-add-save';
  saveBtn.textContent = t('common.save');
  saveBtn.addEventListener('click', function () {
    const title = titleInput.value.trim();
    if (!title) {
      titleInput.focus();
      return;
    }
    const dueAt = dateInput.value ? new Date(dateInput.value).getTime() : null;
    const priority = parseInt(prioritySelect.value, 10);
    window.deadlineAura.updateLocalTask({
      id: task.id,
      title: title,
      dueAt: dueAt,
      priority: priority,
    });
    editingTaskId = null;
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'local-action-btn';
  cancelBtn.textContent = '\u2715';
  cancelBtn.title = t('common.cancel');
  cancelBtn.addEventListener('click', function () {
    editingTaskId = null;
    renderTaskList(lastTasks, lastPalette);
  });

  titleInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
    if (e.key === 'Escape') {
      editingTaskId = null;
      renderTaskList(lastTasks, lastPalette);
    }
  });

  row.appendChild(dateInput);
  row.appendChild(prioritySelect);
  row.appendChild(saveBtn);
  row.appendChild(cancelBtn);

  form.appendChild(titleInput);
  form.appendChild(row);

  return form;
}

function padTwo(n) {
  return String(n).padStart(2, '0');
}

const DURATION_PRESETS_MIN = [15, 30, 60, 90];
const LOGGED_BADGE_MS = 3000;

// Optional link to a Jira issue for a personal task: collapsed until the user asks for it.
function createJiraKeyPicker(task, onKeyChange) {
  const wrap = document.createElement('div');
  wrap.className = 'jira-key-picker';

  const reveal = document.createElement('button');
  reveal.type = 'button';
  reveal.className = 'time-log-link';
  reveal.textContent = t('sidebar.link_jira_optional');

  const fields = document.createElement('div');
  fields.hidden = true;

  const jiraSelect = document.createElement('select');
  jiraSelect.className = 'time-log-jira-select';
  jiraSelect.setAttribute('aria-label', t('sidebar.select_jira_task'));
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = t('sidebar.select_jira_task');
  jiraSelect.appendChild(placeholder);
  const jiraTasks = (lastTasks || []).filter(function (item) {
    return item.source === 'jira';
  });
  for (let i = 0; i < jiraTasks.length; i++) {
    const opt = document.createElement('option');
    opt.value = extractJiraKey(jiraTasks[i].title) || '';
    opt.textContent = jiraTasks[i].title;
    jiraSelect.appendChild(opt);
  }

  const orLabel = document.createElement('div');
  orLabel.className = 'time-log-or-label';
  orLabel.textContent = t('sidebar.or_manual_code');

  const manualKeyInput = document.createElement('input');
  manualKeyInput.type = 'text';
  manualKeyInput.className = 'time-log-manual-key';
  manualKeyInput.placeholder = t('sidebar.manual_code_placeholder');
  manualKeyInput.setAttribute('aria-label', t('sidebar.or_manual_code'));

  function currentKey() {
    const manual = manualKeyInput.value.trim().toUpperCase();
    return manual || jiraSelect.value || null;
  }

  jiraSelect.addEventListener('change', function () {
    if (jiraSelect.value) {
      manualKeyInput.value = '';
    }
    onKeyChange(currentKey());
  });
  manualKeyInput.addEventListener('input', function () {
    if (manualKeyInput.value.trim()) {
      jiraSelect.value = '';
    }
    onKeyChange(currentKey());
  });
  reveal.addEventListener('click', function () {
    reveal.hidden = true;
    fields.hidden = false;
    jiraSelect.focus();
  });

  fields.appendChild(jiraSelect);
  fields.appendChild(orLabel);
  fields.appendChild(manualKeyInput);
  wrap.appendChild(reveal);
  wrap.appendChild(fields);
  return { element: wrap, getKey: currentKey };
}

function createLabelledField(labelText, control, id) {
  const field = document.createElement('div');
  field.className = 'time-log-field';
  const label = document.createElement('label');
  label.className = 'time-log-label';
  label.htmlFor = id;
  label.textContent = labelText;
  control.id = id;
  field.appendChild(label);
  field.appendChild(control);
  return field;
}

function createFormError() {
  const error = document.createElement('p');
  error.className = 'time-log-error';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  return {
    element: error,
    show: function (message) {
      error.textContent = message;
      error.hidden = false;
    },
    clear: function () {
      error.hidden = true;
    },
  };
}

function createTimeLogForm(task) {
  const form = document.createElement('div');
  form.className = 'time-log-form';
  const idBase = 'tl-' + String(task.id).replace(/[^a-zA-Z0-9_-]/g, '_');

  const header = document.createElement('div');
  header.className = 'time-log-header';
  header.textContent = t('sidebar.log_time_title');
  form.appendChild(header);

  const jiraKey = extractJiraKey(task.title);
  const summaryEl = document.createElement('div');
  summaryEl.className = 'time-log-summary';
  summaryEl.textContent = buildEventSummary(jiraKey, task.title);
  form.appendChild(summaryEl);

  if (task.source === 'local' && !jiraKey) {
    const picker = createJiraKeyPicker(task, function (key) {
      summaryEl.textContent = key ? '[' + key + '] - ' + task.title : task.title;
    });
    form.appendChild(picker.element);
  }

  const now = new Date();
  const roundedMinutes = Math.floor(now.getMinutes() / 15) * 15;
  now.setMinutes(roundedMinutes, 0, 0);

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'time-log-date';
  dateInput.value =
    now.getFullYear() + '-' + padTwo(now.getMonth() + 1) + '-' + padTwo(now.getDate());

  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.className = 'time-log-time';
  timeInput.value = padTwo(now.getHours()) + ':' + padTwo(now.getMinutes());

  const row1 = document.createElement('div');
  row1.className = 'time-log-row';
  row1.appendChild(createLabelledField(t('sidebar.label_day'), dateInput, idBase + '-date'));
  row1.appendChild(createLabelledField(t('sidebar.label_start'), timeInput, idBase + '-time'));
  form.appendChild(row1);

  const durationInput = document.createElement('input');
  durationInput.type = 'number';
  durationInput.className = 'time-log-duration';
  durationInput.min = '15';
  durationInput.max = '480';
  durationInput.step = '15';
  durationInput.value = '60';

  const presets = document.createElement('div');
  presets.className = 'time-log-presets';
  function syncPresets() {
    presets.querySelectorAll('button').forEach(function (b) {
      const active = b.dataset.minutes === durationInput.value;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }
  for (const minutes of DURATION_PRESETS_MIN) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.dataset.minutes = String(minutes);
    chip.textContent = minutes < 60 ? minutes + ' min' : formatCountdown(minutes / 60);
    chip.addEventListener('click', function () {
      durationInput.value = String(minutes);
      syncPresets();
    });
    presets.appendChild(chip);
  }
  durationInput.addEventListener('input', syncPresets);
  syncPresets();

  const durationField = createLabelledField(
    t('sidebar.label_duration'),
    durationInput,
    idBase + '-duration',
  );
  durationField.appendChild(presets);
  form.appendChild(durationField);

  const calendarSelect = document.createElement('select');
  calendarSelect.className = 'time-log-calendar-select';
  const loadingOpt = document.createElement('option');
  loadingOpt.value = '';
  loadingOpt.textContent = t('sidebar.select_calendar');
  calendarSelect.appendChild(loadingOpt);
  loadCalendarOptions(calendarSelect);
  form.appendChild(
    createLabelledField(t('sidebar.label_calendar'), calendarSelect, idBase + '-calendar'),
  );

  const error = createFormError();

  const sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.className = 'time-log-send';
  sendBtn.textContent = t('sidebar.log_time');

  const cancelBtn = createIconButton({
    icon: 'close',
    label: t('common.cancel'),
    onClick: function () {
      timeLogTaskId = null;
      renderTaskList(lastTasks, lastPalette);
    },
  });

  sendBtn.addEventListener('click', function () {
    error.clear();
    const duration = parseInt(durationInput.value, 10);
    if (!duration || duration < 1) {
      error.show(t('sidebar.error_duration'));
      durationInput.focus();
      return;
    }
    const calId = calendarSelect.value;
    if (!calId) {
      error.show(t('sidebar.error_calendar'));
      calendarSelect.focus();
      return;
    }
    const start = new Date(dateInput.value + 'T' + timeInput.value + ':00');
    if (Number.isNaN(start.getTime())) {
      error.show(t('sidebar.error_start'));
      dateInput.focus();
      return;
    }
    const startTime = start.toISOString();

    sendBtn.disabled = true;
    sendBtn.textContent = t('sidebar.logging');

    window.deadlineAura
      .logTimeToCalendar({
        summary: summaryEl.textContent,
        startTime: startTime,
        durationMinutes: duration,
        calendarId: calId,
      })
      .then(function (result) {
        if (result.ok) {
          window.deadlineAura.setDefaultLogCalendar(calId);
          timeLogTaskId = null;
          temporaryLoggedTaskId = task.id;
          renderTaskList(lastTasks, lastPalette);
          setTimeout(function () {
            temporaryLoggedTaskId = null;
            renderTaskList(lastTasks, lastPalette);
          }, LOGGED_BADGE_MS);
        } else {
          sendBtn.disabled = false;
          sendBtn.textContent = t('sidebar.log_time');
          error.show(t('sidebar.log_failed', { error: result.error || '?' }));
        }
      });
  });

  const row2 = document.createElement('div');
  row2.className = 'time-log-row time-log-actions';
  row2.appendChild(sendBtn);
  row2.appendChild(cancelBtn);
  form.appendChild(row2);
  form.appendChild(error.element);

  return form;
}

function loadCalendarOptions(selectEl) {
  if (cachedCalendars) {
    populateCalendarSelect(selectEl, cachedCalendars);
    return;
  }
  window.deadlineAura.listCalendars().then(function (result) {
    if (result.ok && result.calendars) {
      cachedCalendars = result.calendars;
      populateCalendarSelect(selectEl, result.calendars);
    }
  });
}

function populateCalendarSelect(selectEl, calendars) {
  selectEl.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = t('sidebar.select_calendar');
  selectEl.appendChild(placeholder);

  for (let i = 0; i < calendars.length; i++) {
    const opt = document.createElement('option');
    opt.value = calendars[i].id;
    opt.textContent = calendars[i].summary;
    selectEl.appendChild(opt);
  }

  window.deadlineAura.getDefaultLogCalendar().then(function (result) {
    if (result.ok && result.calendarId) {
      selectEl.value = result.calendarId;
    }
  });
}

function createTaskCard(task) {
  if (task.source === 'local' && editingTaskId === task.id) {
    return createEditForm(task);
  }

  const card = document.createElement('div');
  card.className = 'task-card';
  if (task.web_url) {
    card.classList.add('clickable');
    card.addEventListener('click', function (e) {
      if (e.target.closest('.task-actions')) {
        return;
      }
      window.deadlineAura.openLink(task.web_url);
    });
  }

  const color = urgencyToColor(task.urgency_score);
  card.style.borderLeftColor = color;

  const isCritical = task.urgency_score > 0.8;
  const now = Date.now();
  const eventStatus = getEventStatus(task, now);
  const countdown = eventStatus.label;

  const header = document.createElement('div');
  header.className = 'task-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'task-title';
  titleEl.textContent = task.title;

  const dot = document.createElement('span');
  dot.className = 'task-dot' + (isCritical ? ' critical' : '');
  dot.style.background = eventStatus.status === 'ongoing' ? COLOR_ONGOING : color;

  const countdownEl = document.createElement('div');
  countdownEl.className = 'task-countdown';
  if (eventStatus.status === 'ongoing') {
    countdownEl.style.color = COLOR_ONGOING;
    countdownEl.classList.add('event-ongoing');
  } else if (eventStatus.status === 'ended') {
    countdownEl.style.color = COLOR_ENDED;
    countdownEl.classList.add('event-ended');
  } else {
    countdownEl.style.color = urgencyToTextColor(task.urgency_score);
  }
  countdownEl.textContent = countdown + ' ';
  countdownEl.appendChild(dot);

  header.appendChild(titleEl);
  header.appendChild(countdownEl);

  const meta = document.createElement('div');
  meta.className = 'task-meta';

  const prioKey = priorityKey(Number(task.priority));
  if (prioKey) {
    const prio = document.createElement('span');
    prio.className = 'task-priority prio-' + Number(task.priority);
    prio.textContent = t(prioKey);
    meta.appendChild(prio);
  }

  if (task.ai_category) {
    const badge = document.createElement('span');
    badge.className = 'task-category';
    badge.textContent = task.ai_category;
    meta.appendChild(badge);
  }

  if (temporaryLoggedTaskId === task.id) {
    const logged = document.createElement('span');
    logged.className = 'task-logged';
    logged.textContent = t('sidebar.time_logged');
    meta.appendChild(logged);
  }

  const actions = document.createElement('span');
  actions.className = 'task-actions';
  appendPrimaryActions(actions, task);
  const menuItems = buildTaskMenuItems(task);
  if (menuItems.length > 0) {
    actions.appendChild(createActionMenu(t('sidebar.more_actions'), menuItems));
  }
  meta.appendChild(actions);

  card.appendChild(header);
  card.appendChild(meta);

  // Append time log form if this task is being logged
  if (timeLogTaskId === task.id) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(card);
    wrapper.appendChild(createTimeLogForm(task));
    return wrapper;
  }

  // Append timer calendar picker if needed
  if (timerPickerTaskId === task.id) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(card);
    wrapper.appendChild(createTimerCalendarPicker(task));
    return wrapper;
  }

  return card;
}

// Buttons always visible on a card: complete, favorite and the live timer.
function appendPrimaryActions(container, task) {
  if (task.source === 'local') {
    container.appendChild(
      createIconButton({
        icon: 'check',
        label: t('sidebar.complete'),
        className: 'done-btn',
        onClick: function () {
          window.deadlineAura.completeLocalTask(task.id);
        },
      }),
    );
  }

  if (task.source === 'jira') {
    const isFav = favoriteTaskIds.has(task.id);
    container.appendChild(
      createIconButton({
        icon: 'star',
        label: isFav ? t('sidebar.remove_from_favorites') : t('sidebar.add_to_favorites'),
        className: 'favorite-btn' + (isFav ? ' favorited' : ''),
        onClick: function () {
          if (isFav) {
            window.deadlineAura.unfavoriteTask(task.id);
          } else {
            window.deadlineAura.favoriteTask(task.id);
          }
        },
      }),
    );
  }

  // A running timer always keeps its stop button, even if Google stopped being available.
  const isTimerActive = activeTimer && activeTimer.taskId === task.id;
  if (
    (task.source === 'jira' || task.source === 'local') &&
    (googleCalendarReady || isTimerActive)
  ) {
    container.appendChild(createTimerButton(task));
  }
}

function createTimerButton(task) {
  const isTimerActive = activeTimer && activeTimer.taskId === task.id;
  if (isTimerActive) {
    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'timer-stop-btn';
    stopBtn.title = t('sidebar.timer_stop');
    stopBtn.setAttribute('aria-label', t('sidebar.timer_stop'));
    const elapsed = document.createElement('span');
    elapsed.className = 'timer-elapsed';
    elapsed.dataset.taskId = task.id;
    elapsed.textContent = formatElapsed(activeTimer.startTime);
    stopBtn.appendChild(createIcon('stop'));
    stopBtn.appendChild(elapsed);
    stopBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      stopTimer();
    });
    return stopBtn;
  }
  const isOtherTimerActive = activeTimer && activeTimer.taskId !== task.id;
  return createIconButton({
    icon: 'play',
    label: t('sidebar.timer_start'),
    className: 'timer-play-btn' + (isOtherTimerActive ? ' disabled' : ''),
    onClick: function () {
      if (isOtherTimerActive) {
        stopTimer();
      }
      handlePlayClick(task);
    },
  });
}

// Secondary actions, grouped behind the "more" button with their names written out.
function buildTaskMenuItems(task) {
  const items = [];
  if (task.source === 'local') {
    items.push({
      label: t('common.edit'),
      icon: 'edit',
      onClick: function () {
        editingTaskId = task.id;
        renderTaskList(lastTasks, lastPalette);
      },
    });
  }
  if (task.source === 'jira' || task.source === 'local') {
    const isPinned = pinnedTaskIds.has(task.id);
    items.push({
      label: isPinned ? t('sidebar.unpin_from_desktop') : t('sidebar.pin_to_desktop'),
      icon: isPinned ? 'unpin' : 'pin',
      onClick: function () {
        if (isPinned) {
          window.deadlineAura.unpinTask(task.id);
        } else {
          window.deadlineAura.pinTask(task.id);
        }
      },
    });
    if (googleCalendarReady) {
      items.push({
        label: t('sidebar.log_time'),
        icon: 'clock',
        onClick: function () {
          timeLogTaskId = timeLogTaskId === task.id ? null : task.id;
          renderTaskList(lastTasks, lastPalette);
        },
      });
    } else {
      // Time logging writes to Google Calendar: point to the setup instead of a dead form.
      items.push({
        label: t('sidebar.google_connect'),
        icon: 'clock',
        onClick: function () {
          window.deadlineAura.openConfig();
        },
      });
    }
  }
  if (task.source === 'local') {
    items.push({
      label: t('common.delete'),
      icon: 'trash',
      danger: true,
      onClick: function () {
        requestLocalDelete(task);
      },
    });
  }
  return items;
}

// --- Delete with undo: the task disappears at once, the IPC delete waits for the undo window ---
const UNDO_DELETE_MS = 5000;
let pendingDelete = null; // { task, timeoutId }

function requestLocalDelete(task) {
  commitPendingDelete();
  pendingDelete = { task: task, timeoutId: setTimeout(commitPendingDelete, UNDO_DELETE_MS) };
  renderTaskList(lastTasks, lastPalette);
}

function commitPendingDelete() {
  if (!pendingDelete) {
    return;
  }
  clearTimeout(pendingDelete.timeoutId);
  const taskId = pendingDelete.task.id;
  pendingDelete = null;
  window.deadlineAura.deleteLocalTask(taskId);
  // Drop it locally too, so it does not flash back before the next update arrives.
  lastTasks = (lastTasks || []).filter(function (item) {
    return item.id !== taskId;
  });
  renderTaskList(lastTasks, lastPalette);
}

// Closing or reloading the sidebar inside the undo window must still delete the task.
window.addEventListener('pagehide', commitPendingDelete);
window.addEventListener('beforeunload', commitPendingDelete);

function undoPendingDelete() {
  if (!pendingDelete) {
    return;
  }
  clearTimeout(pendingDelete.timeoutId);
  pendingDelete = null;
  renderTaskList(lastTasks, lastPalette);
}

function handlePlayClick(task) {
  window.deadlineAura.getDefaultLogCalendar().then(function (result) {
    if (result.ok && result.calendarId) {
      startTimer(task, result.calendarId);
    } else {
      timerPickerTaskId = timerPickerTaskId === task.id ? null : task.id;
      renderTaskList(lastTasks, lastPalette);
    }
  });
}

function createTimerCalendarPicker(task) {
  const form = document.createElement('div');
  form.className = 'timer-picker-form';
  const idBase = 'tp-' + String(task.id).replace(/[^a-zA-Z0-9_-]/g, '_');

  const header = document.createElement('div');
  header.className = 'time-log-header';
  header.textContent = t('sidebar.timer_select_calendar');
  form.appendChild(header);

  let picker = null;
  if (task.source === 'local' && !extractJiraKey(task.title)) {
    picker = createJiraKeyPicker(task, function () {});
    form.appendChild(picker.element);
  }

  const calendarSelect = document.createElement('select');
  calendarSelect.className = 'time-log-calendar-select';
  loadCalendarOptions(calendarSelect);
  form.appendChild(
    createLabelledField(t('sidebar.label_calendar'), calendarSelect, idBase + '-calendar'),
  );

  const error = createFormError();

  const row = document.createElement('div');
  row.className = 'time-log-row time-log-actions';

  const startBtn = document.createElement('button');
  startBtn.type = 'button';
  startBtn.className = 'timer-start-btn';
  startBtn.textContent = t('sidebar.timer_start');
  startBtn.addEventListener('click', function () {
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
    startTimer(timedTask, calId);
  });
  row.appendChild(startBtn);

  row.appendChild(
    createIconButton({
      icon: 'close',
      label: t('common.cancel'),
      onClick: function () {
        timerPickerTaskId = null;
        renderTaskList(lastTasks, lastPalette);
      },
    }),
  );

  form.appendChild(row);
  form.appendChild(error.element);
  return form;
}

function renderSection(container, title, tasks, _palette, sectionId) {
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = title;
  if (tasks.length > COLLAPSED_LIMIT) {
    const count = document.createElement('span');
    count.className = 'section-count';
    count.textContent = ` (${tasks.length})`;
    label.appendChild(count);
  }
  container.appendChild(label);

  const isExpanded = container.dataset['expanded_' + sectionId] === '1';
  const visibleTasks = isExpanded ? tasks : tasks.slice(0, COLLAPSED_LIMIT);

  for (const task of visibleTasks) {
    container.appendChild(createTaskCard(task));
  }

  if (tasks.length > COLLAPSED_LIMIT) {
    const expandBtn = document.createElement('button');
    expandBtn.className = 'expand-btn';
    expandBtn.textContent = isExpanded
      ? t('sidebar.show_less')
      : t('sidebar.show_all', { n: tasks.length - COLLAPSED_LIMIT });
    expandBtn.addEventListener('click', function () {
      container.dataset['expanded_' + sectionId] = isExpanded ? '0' : '1';
      renderTaskList(lastTasks, lastPalette);
    });
    container.appendChild(expandBtn);
  }
}

function renderJiraSection(container, tasks, _palette) {
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = t('sidebar.jira');
  if (tasks.length > 0) {
    const count = document.createElement('span');
    count.className = 'section-count';
    count.textContent = ` (${tasks.length})`;
    label.appendChild(count);
  }
  container.appendChild(label);

  const searchWrap = document.createElement('div');
  searchWrap.className = 'jira-search-wrap';
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'jira-search';
  searchInput.placeholder = t('sidebar.filter_placeholder');
  searchInput.value = jiraFilter;
  searchInput.addEventListener('input', function () {
    jiraFilter = searchInput.value;
    renderTaskList(lastTasks, lastPalette);
  });
  searchWrap.appendChild(searchInput);
  container.appendChild(searchWrap);

  if (tasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = jiraFilter ? t('sidebar.no_results') : t('sidebar.no_jira_tasks');
    container.appendChild(empty);
    return;
  }

  const isExpanded = container.dataset.expanded_jira === '1';
  const visibleTasks = isExpanded ? tasks : tasks.slice(0, COLLAPSED_LIMIT);

  for (const task of visibleTasks) {
    container.appendChild(createTaskCard(task));
  }

  if (tasks.length > COLLAPSED_LIMIT) {
    const expandBtn = document.createElement('button');
    expandBtn.className = 'expand-btn';
    expandBtn.textContent = isExpanded
      ? t('sidebar.show_less')
      : t('sidebar.show_all', { n: tasks.length - COLLAPSED_LIMIT });
    expandBtn.addEventListener('click', function () {
      container.dataset.expanded_jira = isExpanded ? '0' : '1';
      renderTaskList(lastTasks, lastPalette);
    });
    container.appendChild(expandBtn);
  }
}

let addFormVisible = false;
let editingTaskId = null;

function openQuickAdd() {
  addFormVisible = true;
  renderTaskList(lastTasks, lastPalette);
  const input = document.getElementById('quickAddTitle');
  if (input) {
    input.focus();
  }
}

function renderLocalSection(container, tasks, _palette, startCardShown) {
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = t('sidebar.local');
  if (tasks.length > 0) {
    const count = document.createElement('span');
    count.className = 'section-count';
    count.textContent = ` (${tasks.length})`;
    label.appendChild(count);
  }

  const addToggle = document.createElement('button');
  addToggle.className = 'local-add-toggle';
  addToggle.textContent = addFormVisible ? '\u2212' : '+';
  addToggle.title = t('sidebar.new_task');
  addToggle.addEventListener('click', function () {
    addFormVisible = !addFormVisible;
    renderTaskList(lastTasks, lastPalette);
  });
  label.appendChild(addToggle);
  container.appendChild(label);

  if (addFormVisible) {
    container.appendChild(createQuickAddForm());
  }

  if (tasks.length === 0 && !addFormVisible) {
    if (!startCardShown) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = t('sidebar.no_local_tasks');
      container.appendChild(empty);
    }
    return;
  }

  const isExpanded = container.dataset.expanded_local === '1';
  const visibleTasks = isExpanded ? tasks : tasks.slice(0, COLLAPSED_LIMIT);

  for (const task of visibleTasks) {
    container.appendChild(createTaskCard(task));
  }

  if (tasks.length > COLLAPSED_LIMIT) {
    const expandBtn = document.createElement('button');
    expandBtn.className = 'expand-btn';
    expandBtn.textContent = isExpanded
      ? t('sidebar.show_less')
      : t('sidebar.show_all', { n: tasks.length - COLLAPSED_LIMIT });
    expandBtn.addEventListener('click', function () {
      container.dataset.expanded_local = isExpanded ? '0' : '1';
      renderTaskList(lastTasks, lastPalette);
    });
    container.appendChild(expandBtn);
  }
}

function createQuickAddForm() {
  const form = document.createElement('div');
  form.className = 'quick-add-form';

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.className = 'quick-add-input';
  titleInput.placeholder = t('sidebar.task_title_placeholder');
  titleInput.id = 'quickAddTitle';

  const row = document.createElement('div');
  row.className = 'quick-add-row';

  const dateInput = document.createElement('input');
  dateInput.type = 'datetime-local';
  dateInput.className = 'quick-add-date';
  dateInput.id = 'quickAddDate';

  const prioritySelect = document.createElement('select');
  prioritySelect.className = 'quick-add-priority';
  prioritySelect.id = 'quickAddPriority';
  const priorities = [
    { value: '1', label: t('priorities.p1_full') },
    { value: '2', label: t('priorities.p2_full') },
    { value: '3', label: t('priorities.p3_full') },
    { value: '4', label: t('priorities.p4_full') },
  ];
  for (let i = 0; i < priorities.length; i++) {
    const opt = document.createElement('option');
    opt.value = priorities[i].value;
    opt.textContent = priorities[i].label;
    if (priorities[i].value === '3') {
      opt.selected = true;
    }
    prioritySelect.appendChild(opt);
  }

  const saveBtn = document.createElement('button');
  saveBtn.className = 'quick-add-save';
  saveBtn.textContent = t('common.add');
  saveBtn.addEventListener('click', function () {
    const title = titleInput.value.trim();
    if (!title) {
      titleInput.focus();
      return;
    }
    const dueAt = dateInput.value ? new Date(dateInput.value).getTime() : null;
    const priority = parseInt(prioritySelect.value, 10);
    window.deadlineAura.createLocalTask({ title: title, dueAt: dueAt, priority: priority });
    addFormVisible = false;
  });

  titleInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      saveBtn.click();
    }
    if (e.key === 'Escape') {
      addFormVisible = false;
      renderTaskList(lastTasks, lastPalette);
    }
  });

  row.appendChild(dateInput);
  row.appendChild(prioritySelect);
  row.appendChild(saveBtn);

  form.appendChild(titleInput);
  form.appendChild(row);

  return form;
}

updateClock();
setInterval(updateClock, 1000);

document.getElementById('btnSync').addEventListener('click', function () {
  window.deadlineAura.syncNow();
  document.getElementById('syncStatus').textContent = t('sidebar.syncing');
});

document.getElementById('btnConfig').addEventListener('click', function () {
  window.deadlineAura.openConfig();
});

document.getElementById('btnLayout').addEventListener('click', function () {
  window.deadlineAura.openOverlay();
});

// Toggle the AI note and 5-day forecast with an explicit button.
(function initAiNotesToggle() {
  const btn = document.getElementById('aiNotesToggle');
  const aiPanel = document.getElementById('aiNotesPanel');
  if (!btn || !aiPanel) {
    return;
  }
  btn.addEventListener('click', function () {
    const isExpanded = aiPanel.classList.toggle('expanded');
    btn.setAttribute('aria-expanded', String(isExpanded));
  });
})();

// The toggle is shown only when there is a note or a forecast to open.
function updateAiNotesToggle(hasNote, hasForecast) {
  const btn = document.getElementById('aiNotesToggle');
  if (btn) {
    btn.hidden = !hasNote && !hasForecast;
  }
}

(function bindScoreBreakdownButton() {
  const btn = document.getElementById('scoreHelpBtn');
  if (!btn) {
    return;
  }
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    toggleScoreBreakdown();
  });
})();

document.getElementById('btnClose').addEventListener('click', function () {
  window.deadlineAura.toggleSidebar();
});

// Cat button: opens a small menu to snooze/disable/reactivate the meeting flyby.
(function initFlybyToggle() {
  const toggle = document.getElementById('flybyToggle');
  const menu = document.getElementById('flybyMenu');
  if (!toggle || !menu) {
    return;
  }

  function closeMenu() {
    menu.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
  }

  function openMenu() {
    menu.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
  }

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    if (menu.hidden) {
      openMenu();
    } else {
      closeMenu();
    }
  });

  menu.querySelectorAll('.flyby-menu-item').forEach(function (item) {
    item.addEventListener('click', async function (e) {
      e.stopPropagation();
      const action = item.dataset.action;
      const res = await window.deadlineAura.setFlybyState(action);
      if (res && res.ok && res.state) {
        _flybyState = res.state;
        applyFlybyIcon();
      } else {
        console.error('flyby:set-state failed for action', action, res && res.error);
      }
      closeMenu();
    });
  });

  document.addEventListener('click', function (e) {
    if (!menu.hidden && !menu.contains(e.target) && !toggle.contains(e.target)) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !menu.hidden) {
      closeMenu();
      toggle.focus();
    }
  });

  window.deadlineAura.getFlybyState().then(function (state) {
    if (state) {
      _flybyState = state;
      applyFlybyIcon();
    }
  });
})();

function renderClinicalNote(note) {
  const el = document.getElementById('clinicalNote');
  if (!el) {
    return;
  }
  if (!note) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  el.textContent = note;
}

function renderScoreBreakdown(payload) {
  const panel = document.getElementById('scoreBreakdownPanel');
  if (panel) {
    panel.innerHTML = buildScoreBreakdownHtml(payload, t);
  }
}

document.getElementById('scoreBreakdownPanel').addEventListener('click', function (e) {
  const openBtn = e.target.closest('.breakdown-open');
  if (openBtn) {
    window.deadlineAura.openLink(openBtn.dataset.url);
  }
});

async function toggleScoreBreakdown() {
  const panel = document.getElementById('scoreBreakdownPanel');
  if (!panel) {
    return;
  }
  const isOpen = !panel.hasAttribute('hidden');
  if (isOpen) {
    panel.setAttribute('hidden', '');
    return;
  }
  panel.removeAttribute('hidden');
  try {
    const payload = await window.deadlineAura.getScoreBreakdown();
    renderScoreBreakdown(payload);
  } catch (err) {
    console.error('[score-breakdown] failed to load:', err);
    renderScoreBreakdown(null);
  }
}

function stressToColor(stress) {
  const score = Math.max(0, Math.min(stress, 10)) / 10;
  return urgencyToColor(score);
}

function renderStressForecast(dailyBreakdown) {
  const container = document.getElementById('stressForecast');
  if (!container) {
    return;
  }
  container.innerHTML = '';

  if (!dailyBreakdown || dailyBreakdown.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';

  const days = dailyBreakdown.slice(0, 5);
  const todayStr = new Date().toISOString().slice(0, 10);
  const rawLocale = _i18nReady ? t('meta.dateLocale') : 'it-IT';
  const locale = rawLocale.includes('-') ? rawLocale : 'it-IT';

  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const col = document.createElement('div');
    col.className = 'forecast-col';

    const value = document.createElement('div');
    value.className = 'forecast-value';
    value.textContent = `${day.stress * 10}%`;
    value.style.color = stressToColor(day.stress);

    const labelEl = document.createElement('div');
    labelEl.className = 'forecast-label';
    const dateObj = new Date(day.date + 'T00:00:00');
    labelEl.textContent = dateObj.toLocaleDateString(locale, { weekday: 'short' }).slice(0, 3);

    if (day.date === todayStr) {
      col.classList.add('forecast-today');
    }

    if (day.reasoning) {
      col.title = day.reasoning;
    }

    col.appendChild(value);
    col.appendChild(labelEl);
    container.appendChild(col);
  }
}

// Restore active timer from localStorage (crash recovery)
restoreTimerState();

// Init i18n before first render
initI18n(window.deadlineAura);

// Load work shift config and listen for changes
window.deadlineAura.getWorkShiftConfig().then((cfg) => {
  setShiftConfig(cfg);
  updateShiftCountdown();
});
window.deadlineAura.onConfigChanged((cfg) => {
  setShiftConfig(cfg.work_shift || null);
  updateShiftCountdown();
  if (cfg.meeting_flyby) {
    _flybyState = {
      enabled: cfg.meeting_flyby.enabled !== false,
      snoozed_until: cfg.meeting_flyby.snoozed_until ?? null,
    };
    applyFlybyIcon();
  }
});

window.deadlineAura.onUpdate(function (data) {
  pinnedTaskIds = new Set(data.pinnedTaskIds || []);
  favoriteTaskIds = new Set(data.favoriteTaskIds || []);
  renderUrgencyBar(data.engineResult.global_score, data.palette);
  googleCalendarReady = data.googleCalendarReady !== false;
  renderClinicalNote(data.clinicalNote);
  renderStressForecast(data.stressForecast);
  updateAiNotesToggle(Boolean(data.clinicalNote), (data.stressForecast || []).length > 0);
  renderTaskList(data.engineResult.tasks, data.palette);
  renderSyncStatus(data.syncStatus || null);
  if (!firstRunHintDismissed) {
    document.getElementById('firstRunHint').hidden = !data.showFirstRunHint;
  }
});

// Set once the user closes the hint, so a late update cannot bring it back.
let firstRunHintDismissed = false;
document.getElementById('firstRunOk').addEventListener('click', function () {
  firstRunHintDismissed = true;
  document.getElementById('firstRunHint').hidden = true;
  window.deadlineAura.dismissFirstRunHint();
});

function renderSyncStatus(status) {
  const view = formatSyncStatus(status, t, function (ms) {
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });
  document.getElementById('syncStatus').textContent = view.text;
  const problem = document.getElementById('syncProblem');
  problem.hidden = !view.problem;
  document.getElementById('syncProblemText').textContent = view.problem || '';
}

document.getElementById('syncProblemOpen').addEventListener('click', function () {
  window.deadlineAura.openConfig();
});

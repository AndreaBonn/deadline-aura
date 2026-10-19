'use strict';

/* global t, _i18nReady, initI18n, formatElapsed, localStorage,
   updateShiftCountdown, setShiftConfig, extractJiraKey, buildEventSummary,
   priorityKey, formatScore100, flybyStateKey, formatSyncStatus, isFlybySuppressed,
   createEditForm, createQuickAddForm, createTimeLogForm, createJiraKeyPicker,
   createLabelledField, createFormError, loadCalendarOptions, buildForecastColumns,
   urgencyToTextColor, buildScoreBreakdownHtml, groupTasksForSections, parseStoredTimer, createTimerState,
   createIcon, createIconButton, createActionMenu, createUndoToast, createStartCard */

const sidebarState = {
  jiraFilter: '',
  lastTasks: null,
  lastPalette: null,
  pinnedTaskIds: new Set(),
  favoriteTaskIds: new Set(),
  timeLogTaskId: null,
  temporaryLoggedTaskId: null,
  cachedCalendars: null,
  googleCalendarReady: true,
  activeTimer: null,
  timerUiInterval: null,
  timerSyncInterval: null,
  timerPickerTaskId: null,
  _flybyState: { enabled: true, snoozed_until: null },
  pendingDelete: null,
  addFormVisible: false,
  editingTaskId: null,
  firstRunHintDismissed: false,
};

function rerender() {
  renderTaskList(sidebarState.lastTasks, sidebarState.lastPalette);
}

const COLLAPSED_LIMIT = 5;
const COLOR_ONGOING = '#4fc3f7';
const COLOR_ENDED = '#888';

// --- Live timer state ---
const TIMER_STORAGE_KEY = 'deadlineaura_active_timer';
const TIMER_UPDATE_INTERVAL_MS = 60 * 1000;
const TIMER_DEFAULT_DURATION_MIN = 30;

function saveTimerState() {
  if (sidebarState.activeTimer) {
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(sidebarState.activeTimer));
  } else {
    localStorage.removeItem(TIMER_STORAGE_KEY);
  }
}

function restoreTimerState() {
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    const saved = parseStoredTimer(raw);
    if (saved) {
      sidebarState.activeTimer = saved;
      startTimerIntervals();
    } else if (raw) {
      localStorage.removeItem(TIMER_STORAGE_KEY);
    }
  } catch (err) {
    void err;
    localStorage.removeItem(TIMER_STORAGE_KEY);
  }
}

function startTimerIntervals() {
  clearTimerIntervals();
  sidebarState.timerUiInterval = setInterval(function () {
    updateTimerDisplay();
  }, 1000);
  sidebarState.timerSyncInterval = setInterval(function () {
    syncTimerToCalendar();
  }, TIMER_UPDATE_INTERVAL_MS);
}

function clearTimerIntervals() {
  if (sidebarState.timerUiInterval) {
    clearInterval(sidebarState.timerUiInterval);
    sidebarState.timerUiInterval = null;
  }
  if (sidebarState.timerSyncInterval) {
    clearInterval(sidebarState.timerSyncInterval);
    sidebarState.timerSyncInterval = null;
  }
}

function updateTimerDisplay() {
  if (!sidebarState.activeTimer) {
    return;
  }
  const el = document.querySelector(
    '.timer-elapsed[data-task-id="' + sidebarState.activeTimer.taskId + '"]',
  );
  if (el) {
    el.textContent = formatElapsed(sidebarState.activeTimer.startTime);
  }
}

function syncTimerToCalendar() {
  if (!sidebarState.activeTimer || !sidebarState.activeTimer.eventId) {
    return;
  }
  window.deadlineAura
    .updateCalendarEvent({
      calendarId: sidebarState.activeTimer.calendarId,
      eventId: sidebarState.activeTimer.eventId,
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

  sidebarState.activeTimer = createTimerState(task, { startTime, calendarId, summary });
  saveTimerState();
  sidebarState.timerPickerTaskId = null;
  rerender();

  window.deadlineAura
    .logTimeToCalendar({
      summary: summary,
      startTime: startTime,
      durationMinutes: TIMER_DEFAULT_DURATION_MIN,
      calendarId: calendarId,
    })
    .then(function (result) {
      if (result.ok && result.eventId) {
        sidebarState.activeTimer.eventId = result.eventId;
        saveTimerState();
        window.deadlineAura.setDefaultLogCalendar(calendarId);
        startTimerIntervals();
      } else {
        sidebarState.activeTimer = null;
        saveTimerState();
        clearTimerIntervals();
        rerender();
      }
    });
}

function stopTimer() {
  if (!sidebarState.activeTimer) {
    return;
  }
  const timer = sidebarState.activeTimer;
  clearTimerIntervals();
  sidebarState.activeTimer = null;
  saveTimerState();

  if (timer.eventId) {
    window.deadlineAura
      .updateCalendarEvent({
        calendarId: timer.calendarId,
        eventId: timer.eventId,
        endTime: new Date().toISOString(),
      })
      .then(function () {
        sidebarState.temporaryLoggedTaskId = timer.taskId;
        rerender();
        setTimeout(function () {
          sidebarState.temporaryLoggedTaskId = null;
          rerender();
        }, 3000);
      });
  } else {
    rerender();
  }
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
  const suppressed = isFlybySuppressed(sidebarState._flybyState, now);
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
      const until = sidebarState._flybyState.snoozed_until
        ? new Date(sidebarState._flybyState.snoozed_until).toLocaleString([], {
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';
      stateEl.textContent = t(flybyStateKey(sidebarState._flybyState, now), { time: until });
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
  if (!sidebarState.activeTimer) {
    return;
  }
  const timerTask = tasks.find(function (task) {
    return task.id === sidebarState.activeTimer.taskId;
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

  sidebarState.lastTasks = tasks;
  sidebarState.lastPalette = palette;

  if (sidebarState.pendingDelete) {
    container.appendChild(
      createUndoToast(
        t('sidebar.deleted_toast', { title: sidebarState.pendingDelete.task.title }),
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
    pendingDeleteId: sidebarState.pendingDelete ? sidebarState.pendingDelete.task.id : null,
    favoriteIds: sidebarState.favoriteTaskIds,
    jiraFilter: sidebarState.jiraFilter,
  });

  renderActiveTimerSection(container, visibleTasks, palette);
  if (isEmpty && !sidebarState.addFormVisible) {
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
  if (jiraTasks.length > 0 || sidebarState.jiraFilter) {
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

function createTaskCard(task) {
  if (task.source === 'local' && sidebarState.editingTaskId === task.id) {
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

  if (sidebarState.temporaryLoggedTaskId === task.id) {
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
  if (sidebarState.timeLogTaskId === task.id) {
    const wrapper = document.createElement('div');
    wrapper.appendChild(card);
    wrapper.appendChild(createTimeLogForm(task));
    return wrapper;
  }

  // Append timer calendar picker if needed
  if (sidebarState.timerPickerTaskId === task.id) {
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
    const isFav = sidebarState.favoriteTaskIds.has(task.id);
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
  const isTimerActive = sidebarState.activeTimer && sidebarState.activeTimer.taskId === task.id;
  if (
    (task.source === 'jira' || task.source === 'local') &&
    (sidebarState.googleCalendarReady || isTimerActive)
  ) {
    container.appendChild(createTimerButton(task));
  }
}

function createTimerButton(task) {
  const isTimerActive = sidebarState.activeTimer && sidebarState.activeTimer.taskId === task.id;
  if (isTimerActive) {
    const stopBtn = document.createElement('button');
    stopBtn.type = 'button';
    stopBtn.className = 'timer-stop-btn';
    stopBtn.title = t('sidebar.timer_stop');
    stopBtn.setAttribute('aria-label', t('sidebar.timer_stop'));
    const elapsed = document.createElement('span');
    elapsed.className = 'timer-elapsed';
    elapsed.dataset.taskId = task.id;
    elapsed.textContent = formatElapsed(sidebarState.activeTimer.startTime);
    stopBtn.appendChild(createIcon('stop'));
    stopBtn.appendChild(elapsed);
    stopBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      stopTimer();
    });
    return stopBtn;
  }
  const isOtherTimerActive =
    sidebarState.activeTimer && sidebarState.activeTimer.taskId !== task.id;
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
        sidebarState.editingTaskId = task.id;
        rerender();
      },
    });
  }
  if (task.source === 'jira' || task.source === 'local') {
    const isPinned = sidebarState.pinnedTaskIds.has(task.id);
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
    if (sidebarState.googleCalendarReady) {
      items.push({
        label: t('sidebar.log_time'),
        icon: 'clock',
        onClick: function () {
          sidebarState.timeLogTaskId = sidebarState.timeLogTaskId === task.id ? null : task.id;
          rerender();
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

function requestLocalDelete(task) {
  commitPendingDelete();
  sidebarState.pendingDelete = {
    task: task,
    timeoutId: setTimeout(commitPendingDelete, UNDO_DELETE_MS),
  };
  rerender();
}

function commitPendingDelete() {
  if (!sidebarState.pendingDelete) {
    return;
  }
  clearTimeout(sidebarState.pendingDelete.timeoutId);
  const taskId = sidebarState.pendingDelete.task.id;
  sidebarState.pendingDelete = null;
  window.deadlineAura.deleteLocalTask(taskId);
  // Drop it locally too, so it does not flash back before the next update arrives.
  sidebarState.lastTasks = (sidebarState.lastTasks || []).filter(function (item) {
    return item.id !== taskId;
  });
  rerender();
}

// Closing or reloading the sidebar inside the undo window must still delete the task.
window.addEventListener('pagehide', commitPendingDelete);
window.addEventListener('beforeunload', commitPendingDelete);

function undoPendingDelete() {
  if (!sidebarState.pendingDelete) {
    return;
  }
  clearTimeout(sidebarState.pendingDelete.timeoutId);
  sidebarState.pendingDelete = null;
  rerender();
}

function handlePlayClick(task) {
  window.deadlineAura.getDefaultLogCalendar().then(function (result) {
    if (result.ok && result.calendarId) {
      startTimer(task, result.calendarId);
    } else {
      sidebarState.timerPickerTaskId = sidebarState.timerPickerTaskId === task.id ? null : task.id;
      rerender();
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
        sidebarState.timerPickerTaskId = null;
        rerender();
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
      rerender();
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
  searchInput.value = sidebarState.jiraFilter;
  searchInput.addEventListener('input', function () {
    sidebarState.jiraFilter = searchInput.value;
    rerender();
  });
  searchWrap.appendChild(searchInput);
  container.appendChild(searchWrap);

  if (tasks.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = sidebarState.jiraFilter
      ? t('sidebar.no_results')
      : t('sidebar.no_jira_tasks');
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
      rerender();
    });
    container.appendChild(expandBtn);
  }
}

function openQuickAdd() {
  sidebarState.addFormVisible = true;
  rerender();
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
  addToggle.textContent = sidebarState.addFormVisible ? '\u2212' : '+';
  addToggle.title = t('sidebar.new_task');
  addToggle.addEventListener('click', function () {
    sidebarState.addFormVisible = !sidebarState.addFormVisible;
    rerender();
  });
  label.appendChild(addToggle);
  container.appendChild(label);

  if (sidebarState.addFormVisible) {
    container.appendChild(createQuickAddForm());
  }

  if (tasks.length === 0 && !sidebarState.addFormVisible) {
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
      rerender();
    });
    container.appendChild(expandBtn);
  }
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
        sidebarState._flybyState = res.state;
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
      sidebarState._flybyState = state;
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

  const todayStr = new Date().toISOString().slice(0, 10);
  const rawLocale = _i18nReady ? t('meta.dateLocale') : 'it-IT';
  const columns = buildForecastColumns(dailyBreakdown, { todayKey: todayStr, locale: rawLocale });

  for (const column of columns) {
    const col = document.createElement('div');
    col.className = 'forecast-col';

    const value = document.createElement('div');
    value.className = 'forecast-value';
    value.textContent = column.value;
    value.style.color = column.color;

    const labelEl = document.createElement('div');
    labelEl.className = 'forecast-label';
    labelEl.textContent = column.label;

    if (column.isToday) {
      col.classList.add('forecast-today');
    }

    if (column.title) {
      col.title = column.title;
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
    sidebarState._flybyState = {
      enabled: cfg.meeting_flyby.enabled !== false,
      snoozed_until: cfg.meeting_flyby.snoozed_until ?? null,
    };
    applyFlybyIcon();
  }
});

window.deadlineAura.onUpdate(function (data) {
  sidebarState.pinnedTaskIds = new Set(data.pinnedTaskIds || []);
  sidebarState.favoriteTaskIds = new Set(data.favoriteTaskIds || []);
  renderUrgencyBar(data.engineResult.global_score, data.palette);
  sidebarState.googleCalendarReady = data.googleCalendarReady !== false;
  renderClinicalNote(data.clinicalNote);
  renderStressForecast(data.stressForecast);
  updateAiNotesToggle(Boolean(data.clinicalNote), (data.stressForecast || []).length > 0);
  renderTaskList(data.engineResult.tasks, data.palette);
  renderSyncStatus(data.syncStatus || null);
  if (!sidebarState.firstRunHintDismissed) {
    document.getElementById('firstRunHint').hidden = !data.showFirstRunHint;
  }
});

// Set once the user closes the hint, so a late update cannot bring it back.

document.getElementById('firstRunOk').addEventListener('click', function () {
  sidebarState.firstRunHintDismissed = true;
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

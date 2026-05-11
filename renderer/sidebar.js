'use strict';

/* global t, _i18nReady, initI18n, formatElapsed, localStorage,
   updateShiftCountdown, setShiftConfig */

const COLLAPSED_LIMIT = 5;
const JIRA_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/;

let jiraFilter = '';
let lastTasks = null;
let lastPalette = null;
let pinnedTaskIds = new Set();
let favoriteTaskIds = new Set();
let timeLogTaskId = null;
let temporaryLoggedTaskId = null;
let cachedCalendars = null;

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
}

function renderUrgencyBar(globalScore, palette) {
  const bar = document.getElementById('urgencyBar');
  bar.style.width = `${globalScore * 100}%`;
  bar.style.backgroundColor = palette.accent_hex;

  document.getElementById('urgencyLabel').textContent = palette.label;
  document.getElementById('urgencyScore').textContent = globalScore.toFixed(2);
}

function filterJiraTasks(tasks) {
  if (!jiraFilter) {
    return tasks;
  }
  const query = jiraFilter.toLowerCase();
  return tasks.filter(function (task) {
    return task.title.toLowerCase().includes(query);
  });
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

  if (!tasks || tasks.length === 0) {
    container.innerHTML = '<div class="empty-state">' + t('sidebar.no_tasks') + '</div>';
    return;
  }

  const gcalTasks = tasks
    .filter(function (task) {
      return task.source === 'gcal';
    })
    .sort(function (a, b) {
      return (a.due_at || 0) - (b.due_at || 0);
    });
  const jiraTasks = filterJiraTasks(
    tasks.filter(function (task) {
      return task.source === 'jira';
    }),
  );
  const localTasks = tasks.filter(function (task) {
    return task.source === 'local';
  });

  const favoriteTasks = tasks.filter(function (task) {
    return task.source === 'jira' && favoriteTaskIds.has(task.id);
  });

  renderActiveTimerSection(container, tasks, palette);
  renderLocalSection(container, localTasks, palette);
  if (gcalTasks.length > 0) {
    renderSection(container, t('sidebar.google_calendar'), gcalTasks, palette, 'gcal');
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

function extractJiraKey(title) {
  const match = title.match(JIRA_KEY_PATTERN);
  return match ? match[1] : null;
}

function buildEventSummary(jiraKey, title) {
  if (!jiraKey) {
    return title;
  }
  const cleanTitle = title
    .replace(jiraKey, '')
    .replace(/^[\s·-]+/, '')
    .trim();
  return '[' + jiraKey + '] - ' + cleanTitle;
}

function padTwo(n) {
  return String(n).padStart(2, '0');
}

function createTimeLogForm(task) {
  const form = document.createElement('div');
  form.className = 'time-log-form';

  const header = document.createElement('div');
  header.className = 'time-log-header';
  header.textContent = t('sidebar.log_time_title');
  form.appendChild(header);

  const jiraKey = extractJiraKey(task.title);
  const needsJiraSelect = task.source === 'local' && !jiraKey;

  const summary = buildEventSummary(jiraKey, task.title);
  const summaryEl = document.createElement('div');
  summaryEl.className = 'time-log-summary';
  summaryEl.textContent = summary;
  form.appendChild(summaryEl);

  let jiraSelect = null;
  let manualKeyInput = null;
  if (needsJiraSelect) {
    jiraSelect = document.createElement('select');
    jiraSelect.className = 'time-log-jira-select';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = t('sidebar.select_jira_task');
    jiraSelect.appendChild(placeholder);

    const jiraTasks = (lastTasks || []).filter(function (item) {
      return item.source === 'jira';
    });
    for (let i = 0; i < jiraTasks.length; i++) {
      const opt = document.createElement('option');
      const key = extractJiraKey(jiraTasks[i].title);
      opt.value = key || jiraTasks[i].title;
      opt.textContent = jiraTasks[i].title;
      jiraSelect.appendChild(opt);
    }

    jiraSelect.addEventListener('change', function () {
      const selectedKey = jiraSelect.value;
      if (selectedKey) {
        manualKeyInput.value = '';
        summaryEl.textContent = '[' + selectedKey + '] - ' + task.title;
      } else {
        summaryEl.textContent = task.title;
      }
    });

    form.appendChild(jiraSelect);

    const orLabel = document.createElement('div');
    orLabel.className = 'time-log-or-label';
    orLabel.textContent = t('sidebar.or_manual_code');
    form.appendChild(orLabel);

    manualKeyInput = document.createElement('input');
    manualKeyInput.type = 'text';
    manualKeyInput.className = 'time-log-manual-key';
    manualKeyInput.placeholder = t('sidebar.manual_code_placeholder');
    manualKeyInput.addEventListener('input', function () {
      const val = manualKeyInput.value.trim().toUpperCase();
      if (val) {
        jiraSelect.value = '';
        summaryEl.textContent = '[' + val + '] - ' + task.title;
      } else if (!jiraSelect.value) {
        summaryEl.textContent = task.title;
      }
    });
    form.appendChild(manualKeyInput);
  }

  const now = new Date();
  const roundedMinutes = Math.floor(now.getMinutes() / 15) * 15;
  now.setMinutes(roundedMinutes, 0, 0);

  const row1 = document.createElement('div');
  row1.className = 'time-log-row';

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.className = 'time-log-date';
  dateInput.value =
    now.getFullYear() + '-' + padTwo(now.getMonth() + 1) + '-' + padTwo(now.getDate());

  const timeInput = document.createElement('input');
  timeInput.type = 'time';
  timeInput.className = 'time-log-time';
  timeInput.value = padTwo(now.getHours()) + ':' + padTwo(now.getMinutes());

  const durationInput = document.createElement('input');
  durationInput.type = 'number';
  durationInput.className = 'time-log-duration';
  durationInput.min = '15';
  durationInput.max = '480';
  durationInput.step = '15';
  durationInput.value = '60';
  durationInput.title = t('sidebar.duration_minutes');

  row1.appendChild(dateInput);
  row1.appendChild(timeInput);
  row1.appendChild(durationInput);
  form.appendChild(row1);

  const row2 = document.createElement('div');
  row2.className = 'time-log-row';

  const calendarSelect = document.createElement('select');
  calendarSelect.className = 'time-log-calendar-select';
  const loadingOpt = document.createElement('option');
  loadingOpt.value = '';
  loadingOpt.textContent = t('sidebar.select_calendar');
  calendarSelect.appendChild(loadingOpt);

  loadCalendarOptions(calendarSelect);

  const sendBtn = document.createElement('button');
  sendBtn.className = 'time-log-send';
  sendBtn.textContent = t('sidebar.log_time');

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'local-action-btn';
  cancelBtn.textContent = '\u2715';
  cancelBtn.title = t('common.cancel');
  cancelBtn.addEventListener('click', function () {
    timeLogTaskId = null;
    renderTaskList(lastTasks, lastPalette);
  });

  sendBtn.addEventListener('click', function () {
    const finalSummary = summaryEl.textContent;
    const manualVal = manualKeyInput ? manualKeyInput.value.trim() : '';
    if (needsJiraSelect && !jiraSelect.value && !manualVal) {
      manualKeyInput.focus();
      return;
    }
    const startTime = new Date(dateInput.value + 'T' + timeInput.value + ':00').toISOString();
    const duration = parseInt(durationInput.value, 10);
    if (!duration || duration < 1) {
      durationInput.focus();
      return;
    }
    const calId = calendarSelect.value;
    if (!calId) {
      calendarSelect.focus();
      return;
    }

    sendBtn.disabled = true;
    sendBtn.textContent = t('sidebar.logging');

    window.deadlineAura
      .logTimeToCalendar({
        summary: finalSummary,
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
          }, 3000);
        } else {
          sendBtn.disabled = false;
          sendBtn.textContent = result.error || 'Error';
        }
      });
  });

  row2.appendChild(calendarSelect);
  row2.appendChild(sendBtn);
  row2.appendChild(cancelBtn);
  form.appendChild(row2);

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
      if (
        e.target.closest('.pin-btn') ||
        e.target.closest('.time-log-btn') ||
        e.target.closest('.favorite-btn')
      ) {
        return;
      }
      window.deadlineAura.openLink(task.web_url);
    });
  }

  const color = urgencyToColor(task.urgency_score);
  card.style.borderLeftColor = color;

  const isCritical = task.urgency_score > 0.8;
  const hoursToShow = task.start_at ? (task.start_at - Date.now()) / 3600000 : task.hours_remaining;
  const countdown = formatCountdown(hoursToShow);

  const header = document.createElement('div');
  header.className = 'task-header';

  const titleEl = document.createElement('div');
  titleEl.className = 'task-title';
  titleEl.textContent = task.title;

  const dot = document.createElement('span');
  dot.className = 'task-dot' + (isCritical ? ' critical' : '');
  dot.style.background = color;

  const countdownEl = document.createElement('div');
  countdownEl.className = 'task-countdown';
  countdownEl.style.color = color;
  countdownEl.textContent = countdown + ' ';
  countdownEl.appendChild(dot);

  header.appendChild(titleEl);
  header.appendChild(countdownEl);

  const meta = document.createElement('div');
  meta.className = 'task-meta';
  meta.textContent = String(task.source) + (task.priority ? ' · P' + Number(task.priority) : '');

  if (task.ai_category) {
    const badge = document.createElement('span');
    badge.className = 'task-category';
    badge.textContent = task.ai_category;
    meta.appendChild(badge);
  }

  // Action buttons for local tasks
  if (task.source === 'local') {
    const actionsWrap = document.createElement('span');
    actionsWrap.className = 'local-actions';

    const doneBtn = document.createElement('button');
    doneBtn.className = 'local-action-btn done-btn';
    doneBtn.textContent = '\u2713';
    doneBtn.title = t('sidebar.complete');
    doneBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      window.deadlineAura.completeLocalTask(task.id);
    });
    actionsWrap.appendChild(doneBtn);

    const editBtn = document.createElement('button');
    editBtn.className = 'local-action-btn edit-btn';
    editBtn.textContent = '✏';
    editBtn.title = t('common.edit');
    editBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      editingTaskId = task.id;
      renderTaskList(lastTasks, lastPalette);
    });
    actionsWrap.appendChild(editBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'local-action-btn del-btn';
    delBtn.textContent = '\u2715';
    delBtn.title = t('common.delete');
    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      window.deadlineAura.deleteLocalTask(task.id);
    });
    actionsWrap.appendChild(delBtn);

    meta.appendChild(actionsWrap);
  }

  // Favorite button — solo per task Jira
  if (task.source === 'jira') {
    const favBtn = document.createElement('button');
    const isFav = favoriteTaskIds.has(task.id);
    favBtn.className = 'favorite-btn' + (isFav ? ' favorited' : '');
    favBtn.textContent = '\u2605';
    favBtn.title = isFav ? t('sidebar.remove_from_favorites') : t('sidebar.add_to_favorites');
    favBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isFav) {
        window.deadlineAura.unfavoriteTask(task.id);
      } else {
        window.deadlineAura.favoriteTask(task.id);
      }
    });
    meta.appendChild(favBtn);
  }

  // Pin/unpin button — per task Jira e local
  if (task.source === 'jira' || task.source === 'local') {
    const pinBtn = document.createElement('button');
    const isPinned = pinnedTaskIds.has(task.id);
    pinBtn.className = 'pin-btn' + (isPinned ? ' pinned' : '');
    pinBtn.textContent = isPinned ? '✕' : '📌';
    pinBtn.title = isPinned ? t('sidebar.unpin_from_desktop') : t('sidebar.pin_to_desktop');
    pinBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (isPinned) {
        window.deadlineAura.unpinTask(task.id);
      } else {
        window.deadlineAura.pinTask(task.id);
      }
    });
    meta.appendChild(pinBtn);
  }

  // Time log button — per task Jira e local
  if (task.source === 'jira' || task.source === 'local') {
    const isLogged = temporaryLoggedTaskId === task.id;
    const timeBtn = document.createElement('button');
    timeBtn.className = 'time-log-btn' + (isLogged ? ' logged' : '');
    timeBtn.textContent = isLogged ? '\u2713' : '\u23F1';
    timeBtn.title = isLogged ? t('sidebar.time_logged') : t('sidebar.log_time');
    if (!isLogged) {
      timeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        timeLogTaskId = timeLogTaskId === task.id ? null : task.id;
        renderTaskList(lastTasks, lastPalette);
      });
    }
    meta.appendChild(timeBtn);
  }

  // Live timer play/stop button — per task Jira e local
  if (task.source === 'jira' || task.source === 'local') {
    const isTimerActive = activeTimer && activeTimer.taskId === task.id;
    const isOtherTimerActive = activeTimer && activeTimer.taskId !== task.id;

    if (isTimerActive) {
      const stopBtn = document.createElement('button');
      stopBtn.className = 'timer-stop-btn';
      const elapsed = document.createElement('span');
      elapsed.className = 'timer-elapsed';
      elapsed.dataset.taskId = task.id;
      elapsed.textContent = formatElapsed(activeTimer.startTime);
      stopBtn.appendChild(document.createTextNode('\u25A0 '));
      stopBtn.appendChild(elapsed);
      stopBtn.title = t('sidebar.timer_stop');
      stopBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        stopTimer();
      });
      meta.appendChild(stopBtn);
    } else {
      const playBtn = document.createElement('button');
      playBtn.className = 'timer-play-btn';
      if (isOtherTimerActive) {
        playBtn.classList.add('disabled');
      }
      playBtn.textContent = '\u25B6';
      playBtn.title = t('sidebar.timer_start');
      playBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (isOtherTimerActive) {
          stopTimer();
        }
        handlePlayClick(task);
      });
      meta.appendChild(playBtn);
    }
  }

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

function handlePlayClick(task) {
  const jiraKey = extractJiraKey(task.title);
  const needsJiraSelect = task.source === 'local' && !jiraKey;

  if (needsJiraSelect) {
    timerPickerTaskId = timerPickerTaskId === task.id ? null : task.id;
    renderTaskList(lastTasks, lastPalette);
    return;
  }

  window.deadlineAura.getDefaultLogCalendar().then(function (result) {
    if (result.ok && result.calendarId) {
      startTimer(task, result.calendarId);
    } else {
      timerPickerTaskId = task.id;
      renderTaskList(lastTasks, lastPalette);
    }
  });
}

function createTimerCalendarPicker(task) {
  const form = document.createElement('div');
  form.className = 'timer-picker-form';

  const header = document.createElement('div');
  header.className = 'time-log-header';
  header.textContent = t('sidebar.timer_select_calendar');
  form.appendChild(header);

  const jiraKey = extractJiraKey(task.title);
  const needsJiraSelect = task.source === 'local' && !jiraKey;

  let jiraSelect = null;
  let manualKeyInput = null;

  if (needsJiraSelect) {
    jiraSelect = document.createElement('select');
    jiraSelect.className = 'time-log-jira-select';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = t('sidebar.select_jira_task');
    jiraSelect.appendChild(placeholder);

    const jiraTasks = (lastTasks || []).filter(function (item) {
      return item.source === 'jira';
    });
    for (let i = 0; i < jiraTasks.length; i++) {
      const opt = document.createElement('option');
      const key = extractJiraKey(jiraTasks[i].title);
      opt.value = key || '';
      opt.textContent = jiraTasks[i].title;
      jiraSelect.appendChild(opt);
    }
    form.appendChild(jiraSelect);

    manualKeyInput = document.createElement('input');
    manualKeyInput.type = 'text';
    manualKeyInput.className = 'time-log-manual-key';
    manualKeyInput.placeholder = t('sidebar.manual_code_placeholder');
    form.appendChild(manualKeyInput);
  }

  const row = document.createElement('div');
  row.className = 'time-log-row';

  const calendarSelect = document.createElement('select');
  calendarSelect.className = 'time-log-calendar-select';
  loadCalendarOptions(calendarSelect);
  row.appendChild(calendarSelect);

  const startBtn = document.createElement('button');
  startBtn.className = 'timer-start-btn';
  startBtn.textContent = '\u25B6 ' + t('sidebar.timer_start');
  startBtn.addEventListener('click', function () {
    const calId = calendarSelect.value;
    if (!calId) {
      calendarSelect.focus();
      return;
    }

    if (needsJiraSelect) {
      const manualVal = manualKeyInput ? manualKeyInput.value.trim() : '';
      const selectedKey = jiraSelect ? jiraSelect.value : '';
      if (!selectedKey && !manualVal) {
        if (manualKeyInput) {
          manualKeyInput.focus();
        }
        return;
      }
      const resolvedKey = manualVal || selectedKey;
      const modifiedTask = Object.assign({}, task, {
        title: '[' + resolvedKey + '] - ' + task.title,
      });
      startTimer(modifiedTask, calId);
    } else {
      startTimer(task, calId);
    }
  });
  row.appendChild(startBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'local-action-btn';
  cancelBtn.textContent = '\u2715';
  cancelBtn.title = t('common.cancel');
  cancelBtn.addEventListener('click', function () {
    timerPickerTaskId = null;
    renderTaskList(lastTasks, lastPalette);
  });
  row.appendChild(cancelBtn);

  form.appendChild(row);
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

function renderLocalSection(container, tasks, _palette) {
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
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = t('sidebar.no_local_tasks');
    container.appendChild(empty);
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

// Toggle AI notes panel on urgency bar click
(function initAiNotesToggle() {
  const urgencySection = document.querySelector('.urgency-section');
  const aiPanel = document.getElementById('aiNotesPanel');
  if (!urgencySection || !aiPanel) {
    return;
  }

  const indicator = document.createElement('span');
  indicator.className = 'toggle-indicator';
  indicator.textContent = '▼';
  const urgencyLabel = document.getElementById('urgencyLabel');
  if (urgencyLabel) {
    urgencyLabel.appendChild(indicator);
  }

  urgencySection.addEventListener('click', function () {
    const isExpanded = aiPanel.classList.toggle('expanded');
    urgencySection.classList.toggle('expanded', isExpanded);
  });
})();

document.getElementById('btnClose').addEventListener('click', function () {
  window.deadlineAura.toggleSidebar();
});

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
    value.textContent = day.stress;
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
});

window.deadlineAura.onUpdate(function (data) {
  pinnedTaskIds = new Set(data.pinnedTaskIds || []);
  favoriteTaskIds = new Set(data.favoriteTaskIds || []);
  renderUrgencyBar(data.engineResult.global_score, data.palette);
  renderClinicalNote(data.clinicalNote);
  renderStressForecast(data.stressForecast);
  renderTaskList(data.engineResult.tasks, data.palette);
  document.getElementById('syncStatus').textContent = t('sidebar.updated');
});

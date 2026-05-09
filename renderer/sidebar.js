'use strict';

/* global t, _i18nReady, initI18n, formatCountdown, urgencyToColor */

const COLLAPSED_LIMIT = 5;
let jiraFilter = '';
let lastTasks = null;
let lastPalette = null;
let pinnedTaskIds = new Set();

function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('clock').textContent = `${h}:${m}`;

  const rawLocale = _i18nReady ? t('meta.dateLocale') : 'it-IT';
  const locale = rawLocale.includes('-') ? rawLocale : 'it-IT';
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  document.getElementById('clockDate').textContent = now.toLocaleDateString(locale, options);
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

  renderLocalSection(container, localTasks, palette);
  if (gcalTasks.length > 0) {
    renderSection(container, t('sidebar.google_calendar'), gcalTasks, palette, 'gcal');
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

function createTaskCard(task) {
  if (task.source === 'local' && editingTaskId === task.id) {
    return createEditForm(task);
  }

  const card = document.createElement('div');
  card.className = 'task-card';
  if (task.web_url) {
    card.classList.add('clickable');
    card.addEventListener('click', function (e) {
      if (e.target.closest('.pin-btn')) {
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

  card.appendChild(header);
  card.appendChild(meta);

  return card;
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
  el.style.display = 'block';
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

// Init i18n before first render
initI18n(window.deadlineAura);

window.deadlineAura.onUpdate(function (data) {
  pinnedTaskIds = new Set(data.pinnedTaskIds || []);
  renderUrgencyBar(data.engineResult.global_score, data.palette);
  renderClinicalNote(data.clinicalNote);
  renderStressForecast(data.stressForecast);
  renderTaskList(data.engineResult.tasks, data.palette);
  document.getElementById('syncStatus').textContent = t('sidebar.updated');
});

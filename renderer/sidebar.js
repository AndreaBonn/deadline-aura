'use strict';

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

  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  document.getElementById('clockDate').textContent = now.toLocaleDateString('it-IT', options);
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
  return tasks.filter(function (t) {
    return t.title.toLowerCase().includes(query);
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
    container.innerHTML = '<div class="empty-state">Nessun task in arrivo</div>';
    return;
  }

  const gcalTasks = tasks
    .filter(function (t) {
      return t.source === 'gcal';
    })
    .sort(function (a, b) {
      return (a.due_at || 0) - (b.due_at || 0);
    });
  const jiraTasks = filterJiraTasks(
    tasks.filter(function (t) {
      return t.source === 'jira';
    }),
  );
  const localTasks = tasks.filter(function (t) {
    return t.source === 'local';
  });

  renderLocalSection(container, localTasks, palette);
  if (gcalTasks.length > 0) {
    renderSection(container, 'Google Calendar', gcalTasks, palette, 'gcal');
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

function createTaskCard(task) {
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
  const countdown = formatCountdown(task.hours_remaining);

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
    doneBtn.title = 'Completa';
    doneBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      window.deadlineAura.completeLocalTask(task.id);
    });
    actionsWrap.appendChild(doneBtn);

    const delBtn = document.createElement('button');
    delBtn.className = 'local-action-btn del-btn';
    delBtn.textContent = '\u2715';
    delBtn.title = 'Elimina';
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
    pinBtn.title = isPinned ? 'Rimuovi dal desktop' : 'Appunta sul desktop';
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
      ? 'Mostra meno'
      : `Mostra tutti (${tasks.length - COLLAPSED_LIMIT} altri)`;
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
  label.textContent = 'Jira';
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
  searchInput.placeholder = 'Filtra per codice o titolo...';
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
    empty.textContent = jiraFilter ? 'Nessun risultato' : 'Nessun task Jira';
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
      ? 'Mostra meno'
      : `Mostra tutti (${tasks.length - COLLAPSED_LIMIT} altri)`;
    expandBtn.addEventListener('click', function () {
      container.dataset.expanded_jira = isExpanded ? '0' : '1';
      renderTaskList(lastTasks, lastPalette);
    });
    container.appendChild(expandBtn);
  }
}

let addFormVisible = false;

function renderLocalSection(container, tasks, _palette) {
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = 'Personali';
  if (tasks.length > 0) {
    const count = document.createElement('span');
    count.className = 'section-count';
    count.textContent = ` (${tasks.length})`;
    label.appendChild(count);
  }

  const addToggle = document.createElement('button');
  addToggle.className = 'local-add-toggle';
  addToggle.textContent = addFormVisible ? '\u2212' : '+';
  addToggle.title = 'Nuovo task';
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
    empty.textContent = 'Nessun task personale';
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
      ? 'Mostra meno'
      : `Mostra tutti (${tasks.length - COLLAPSED_LIMIT} altri)`;
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
  titleInput.placeholder = 'Titolo task...';
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
    { value: '1', label: 'P1 - Critico' },
    { value: '2', label: 'P2 - Alto' },
    { value: '3', label: 'P3 - Medio' },
    { value: '4', label: 'P4 - Basso' },
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
  saveBtn.textContent = 'Aggiungi';
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
  document.getElementById('syncStatus').textContent = 'sync...';
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

window.deadlineAura.onUpdate(function (data) {
  pinnedTaskIds = new Set(data.pinnedTaskIds || []);
  renderUrgencyBar(data.engineResult.global_score, data.palette);
  renderTaskList(data.engineResult.tasks, data.palette);
  document.getElementById('syncStatus').textContent = 'aggiornato';
});

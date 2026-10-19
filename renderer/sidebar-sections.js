'use strict';

/* global t, sidebarState, rerender, groupTasksForSections, createTaskCard, createUndoToast,
   createStartCard, createQuickAddForm */

const COLLAPSED_LIMIT = 5;
const UNDO_DELETE_MS = 5000;

// --- Delete with undo: the task disappears at once, the IPC delete waits for the undo window ---
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

function undoPendingDelete() {
  if (!sidebarState.pendingDelete) {
    return;
  }
  clearTimeout(sidebarState.pendingDelete.timeoutId);
  sidebarState.pendingDelete = null;
  rerender();
}

// --- Sections ---
function createSectionLabel(title, count) {
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = title;
  if (count > 0) {
    const countEl = document.createElement('span');
    countEl.className = 'section-count';
    countEl.textContent = ` (${count})`;
    label.appendChild(countEl);
  }
  return label;
}

// Cards of a section, collapsed to COLLAPSED_LIMIT with a show all/less toggle.
function appendCollapsibleCards(container, tasks, sectionId) {
  const expandedKey = 'expanded_' + sectionId;
  const isExpanded = container.dataset[expandedKey] === '1';
  const visibleTasks = isExpanded ? tasks : tasks.slice(0, COLLAPSED_LIMIT);

  for (const task of visibleTasks) {
    container.appendChild(createTaskCard(task));
  }
  if (tasks.length <= COLLAPSED_LIMIT) {
    return;
  }
  const expandBtn = document.createElement('button');
  expandBtn.className = 'expand-btn';
  expandBtn.textContent = isExpanded
    ? t('sidebar.show_less')
    : t('sidebar.show_all', { n: tasks.length - COLLAPSED_LIMIT });
  expandBtn.addEventListener('click', function () {
    container.dataset[expandedKey] = isExpanded ? '0' : '1';
    rerender();
  });
  container.appendChild(expandBtn);
}

function renderSection(container, title, tasks, sectionId) {
  const label = createSectionLabel(title, 0);
  if (tasks.length > COLLAPSED_LIMIT) {
    const count = document.createElement('span');
    count.className = 'section-count';
    count.textContent = ` (${tasks.length})`;
    label.appendChild(count);
  }
  container.appendChild(label);
  appendCollapsibleCards(container, tasks, sectionId);
}

function createJiraSearch() {
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
  return searchWrap;
}

function createEmptyState(text) {
  const empty = document.createElement('div');
  empty.className = 'empty-state';
  empty.textContent = text;
  return empty;
}

function renderJiraSection(container, tasks) {
  container.appendChild(createSectionLabel(t('sidebar.jira'), tasks.length));
  container.appendChild(createJiraSearch());

  if (tasks.length === 0) {
    const text = sidebarState.jiraFilter ? t('sidebar.no_results') : t('sidebar.no_jira_tasks');
    container.appendChild(createEmptyState(text));
    return;
  }
  appendCollapsibleCards(container, tasks, 'jira');
}

function openQuickAdd() {
  sidebarState.addFormVisible = true;
  rerender();
  const input = document.getElementById('quickAddTitle');
  if (input) {
    input.focus();
  }
}

function createLocalLabel(taskCount) {
  const label = createSectionLabel(t('sidebar.local'), taskCount);
  const addToggle = document.createElement('button');
  addToggle.className = 'local-add-toggle';
  addToggle.textContent = sidebarState.addFormVisible ? '−' : '+';
  addToggle.title = t('sidebar.new_task');
  addToggle.addEventListener('click', function () {
    sidebarState.addFormVisible = !sidebarState.addFormVisible;
    rerender();
  });
  label.appendChild(addToggle);
  return label;
}

function renderLocalSection(container, tasks, startCardShown) {
  container.appendChild(createLocalLabel(tasks.length));

  if (sidebarState.addFormVisible) {
    container.appendChild(createQuickAddForm());
  }
  if (tasks.length === 0 && !sidebarState.addFormVisible) {
    if (!startCardShown) {
      container.appendChild(createEmptyState(t('sidebar.no_local_tasks')));
    }
    return;
  }
  appendCollapsibleCards(container, tasks, 'local');
}

function renderActiveTimerSection(container, tasks) {
  if (!sidebarState.activeTimer) {
    return;
  }
  const timerTask = tasks.find((task) => task.id === sidebarState.activeTimer.taskId);
  if (!timerTask) {
    return;
  }
  const label = document.createElement('div');
  label.className = 'section-label active-timer-label';
  label.textContent = t('sidebar.in_progress');
  container.appendChild(label);
  container.appendChild(createTaskCard(timerTask));
}

function renderStartCard(container, isEmpty) {
  if (!isEmpty || sidebarState.addFormVisible) {
    return;
  }
  container.appendChild(
    createStartCard({
      onNewTask: openQuickAdd,
      onOpenSettings: function () {
        window.deadlineAura.openConfig();
      },
    }),
  );
}

function renderSourceSections(container, groups) {
  const { gcal, outlook, jira, local, gtasks, favorites, isEmpty } = groups;
  renderLocalSection(container, local, isEmpty);
  const optional = [
    [gtasks, 'sidebar.google_tasks', 'gtasks'],
    [gcal, 'sidebar.google_calendar', 'gcal'],
    [outlook, 'sidebar.outlook', 'outlook'],
    [favorites, 'sidebar.jira_favorites', 'jira_favorites'],
  ];
  for (const [tasks, titleKey, sectionId] of optional) {
    if (tasks.length > 0) {
      renderSection(container, t(titleKey), tasks, sectionId);
    }
  }
  if (jira.length > 0 || sidebarState.jiraFilter) {
    renderJiraSection(container, jira);
  }
}

function restoreSearchFocus(container, cursorPos) {
  const newInput = container.querySelector('.jira-search');
  if (newInput) {
    newInput.focus();
    newInput.setSelectionRange(cursorPos, cursorPos);
  }
}

function renderTaskList(tasks, palette) {
  const container = document.getElementById('tasksContainer');
  const searchFocused =
    document.activeElement && document.activeElement.classList.contains('jira-search');
  const cursorPos = searchFocused ? document.activeElement.selectionStart : 0;

  container.innerHTML = '';
  sidebarState.lastTasks = tasks;
  sidebarState.lastPalette = palette;

  const pending = sidebarState.pendingDelete;
  if (pending) {
    const message = t('sidebar.deleted_toast', { title: pending.task.title });
    container.appendChild(createUndoToast(message, t('sidebar.undo'), undoPendingDelete));
  }
  const groups = groupTasksForSections(tasks, {
    pendingDeleteId: pending ? pending.task.id : null,
    favoriteIds: sidebarState.favoriteTaskIds,
    jiraFilter: sidebarState.jiraFilter,
  });
  renderActiveTimerSection(container, groups.visibleTasks);
  renderStartCard(container, groups.isEmpty);
  renderSourceSections(container, groups);
  if (searchFocused) {
    restoreSearchFocus(container, cursorPos);
  }
}

if (typeof module !== 'undefined') {
  module.exports = { renderTaskList, requestLocalDelete, commitPendingDelete, undoPendingDelete };
}

'use strict';

/* global t, sidebarState, rerender, urgencyToColor, getEventStatus, urgencyToTextColor,
   priorityKey, createEditForm, createTimeLogForm, createActionMenu, createIconButton,
   createTimerButton, createTimerCalendarPicker, requestLocalDelete */

const COLOR_ONGOING = '#4fc3f7';
const COLOR_ENDED = '#888';
const CRITICAL_URGENCY = 0.8;

/**
 * Which secondary actions a card offers, in display order.
 * flags: { isPinned, googleCalendarReady }.
 */
function taskMenuModel(task, { isPinned, googleCalendarReady }) {
  const isLocal = task.source === 'local';
  const items = [];
  if (isLocal) {
    items.push({ id: 'edit', labelKey: 'common.edit', icon: 'edit' });
  }
  if (isLocal || task.source === 'jira') {
    items.push(
      isPinned
        ? { id: 'unpin', labelKey: 'sidebar.unpin_from_desktop', icon: 'unpin' }
        : { id: 'pin', labelKey: 'sidebar.pin_to_desktop', icon: 'pin' },
    );
    // Time logging writes to Google Calendar: point to the setup instead of a dead form.
    items.push(
      googleCalendarReady
        ? { id: 'log-time', labelKey: 'sidebar.log_time', icon: 'clock' }
        : { id: 'connect-google', labelKey: 'sidebar.google_connect', icon: 'clock' },
    );
  }
  if (isLocal) {
    items.push({ id: 'delete', labelKey: 'common.delete', icon: 'trash', danger: true });
  }
  return items;
}

/**
 * Buttons always visible on a card. A running timer keeps its stop button even
 * when Google stopped being available.
 * flags: { isFavorite, isTimerActive, googleCalendarReady }.
 */
function primaryActionsModel(task, { isFavorite, isTimerActive, googleCalendarReady }) {
  const hasTimer = task.source === 'jira' || task.source === 'local';
  return {
    complete: task.source === 'local',
    favorite: task.source === 'jira' ? { isFavorite } : null,
    timer: hasTimer && (googleCalendarReady || isTimerActive),
  };
}

function taskFlags(task) {
  const active = sidebarState.activeTimer;
  return {
    isPinned: sidebarState.pinnedTaskIds.has(task.id),
    isFavorite: sidebarState.favoriteTaskIds.has(task.id),
    isTimerActive: Boolean(active && active.taskId === task.id),
    googleCalendarReady: sidebarState.googleCalendarReady,
  };
}

function toggleBy(isOn, turnOff, turnOn) {
  return function () {
    (isOn ? turnOff : turnOn)();
  };
}

function menuAction(id, task) {
  const api = window.deadlineAura;
  const actions = {
    edit: () => {
      sidebarState.editingTaskId = task.id;
      rerender();
    },
    pin: () => api.pinTask(task.id),
    unpin: () => api.unpinTask(task.id),
    'log-time': () => {
      sidebarState.timeLogTaskId = sidebarState.timeLogTaskId === task.id ? null : task.id;
      rerender();
    },
    'connect-google': () => api.openConfig(),
    delete: () => requestLocalDelete(task),
  };
  return actions[id];
}

// Secondary actions, grouped behind the "more" button with their names written out.
function buildTaskMenuItems(task) {
  return taskMenuModel(task, taskFlags(task)).map(function (entry) {
    const item = {
      label: t(entry.labelKey),
      icon: entry.icon,
      onClick: menuAction(entry.id, task),
    };
    if (entry.danger) {
      item.danger = true;
    }
    return item;
  });
}

function createFavoriteButton(task, isFavorite) {
  const api = window.deadlineAura;
  return createIconButton({
    icon: 'star',
    label: isFavorite ? t('sidebar.remove_from_favorites') : t('sidebar.add_to_favorites'),
    className: 'favorite-btn' + (isFavorite ? ' favorited' : ''),
    onClick: toggleBy(
      isFavorite,
      () => api.unfavoriteTask(task.id),
      () => api.favoriteTask(task.id),
    ),
  });
}

function appendPrimaryActions(container, task) {
  const flags = taskFlags(task);
  const model = primaryActionsModel(task, flags);
  if (model.complete) {
    container.appendChild(
      createIconButton({
        icon: 'check',
        label: t('sidebar.complete'),
        className: 'done-btn',
        onClick: () => window.deadlineAura.completeLocalTask(task.id),
      }),
    );
  }
  if (model.favorite) {
    container.appendChild(createFavoriteButton(task, flags.isFavorite));
  }
  if (model.timer) {
    container.appendChild(createTimerButton(task));
  }
}

function createCountdownElement(task, eventStatus) {
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
  return countdownEl;
}

function createCardHeader(task) {
  const color = urgencyToColor(task.urgency_score);
  const eventStatus = getEventStatus(task, Date.now());

  const header = document.createElement('div');
  header.className = 'task-header';
  const titleEl = document.createElement('div');
  titleEl.className = 'task-title';
  titleEl.textContent = task.title;

  const dot = document.createElement('span');
  dot.className = 'task-dot' + (task.urgency_score > CRITICAL_URGENCY ? ' critical' : '');
  dot.style.background = eventStatus.status === 'ongoing' ? COLOR_ONGOING : color;

  const countdownEl = createCountdownElement(task, eventStatus);
  countdownEl.textContent = eventStatus.label + ' ';
  countdownEl.appendChild(dot);
  header.appendChild(titleEl);
  header.appendChild(countdownEl);
  return header;
}

function createCardBadge(className, text) {
  const badge = document.createElement('span');
  badge.className = className;
  badge.textContent = text;
  return badge;
}

function createCardMeta(task) {
  const meta = document.createElement('div');
  meta.className = 'task-meta';
  const prioKey = priorityKey(Number(task.priority));
  if (prioKey) {
    meta.appendChild(createCardBadge('task-priority prio-' + Number(task.priority), t(prioKey)));
  }
  if (task.ai_category) {
    meta.appendChild(createCardBadge('task-category', task.ai_category));
  }
  if (sidebarState.temporaryLoggedTaskId === task.id) {
    meta.appendChild(createCardBadge('task-logged', t('sidebar.time_logged')));
  }
  const actions = document.createElement('span');
  actions.className = 'task-actions';
  appendPrimaryActions(actions, task);
  const menuItems = buildTaskMenuItems(task);
  if (menuItems.length > 0) {
    actions.appendChild(createActionMenu(t('sidebar.more_actions'), menuItems));
  }
  meta.appendChild(actions);
  return meta;
}

function createCardShell(task) {
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
  card.style.borderLeftColor = urgencyToColor(task.urgency_score);
  return card;
}

function createTaskCard(task) {
  if (task.source === 'local' && sidebarState.editingTaskId === task.id) {
    return createEditForm(task);
  }
  const card = createCardShell(task);
  card.appendChild(createCardHeader(task));
  card.appendChild(createCardMeta(task));

  let extra = null;
  if (sidebarState.timeLogTaskId === task.id) {
    extra = createTimeLogForm(task);
  } else if (sidebarState.timerPickerTaskId === task.id) {
    extra = createTimerCalendarPicker(task);
  }
  if (!extra) {
    return card;
  }
  const wrapper = document.createElement('div');
  wrapper.appendChild(card);
  wrapper.appendChild(extra);
  return wrapper;
}

if (typeof module !== 'undefined') {
  module.exports = { taskMenuModel, primaryActionsModel, createTaskCard };
}

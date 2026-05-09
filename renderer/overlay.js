'use strict';

/* global t, initI18n */

let pinnedTasks = [];
let currentDisplayId = 'default';
let dragState = null;

function formatCountdown(dueAt) {
  if (!dueAt) {
    return '';
  }
  const hoursRemaining = (dueAt - Date.now()) / 3600000;
  if (hoursRemaining < 0) {
    return t('countdown.expired');
  }
  if (hoursRemaining < 1) {
    return Math.round(hoursRemaining * 60) + 'm';
  }
  if (hoursRemaining < 24) {
    return Math.floor(hoursRemaining) + 'h';
  }
  return Math.round(hoursRemaining / 24) + t('countdown.days_short');
}

function extractCode(taskId) {
  const match = taskId.match(/^(?:jira-|gcal-)?(.+)/);
  return match ? match[1] : taskId;
}

function createPostitGhost(task) {
  const el = document.createElement('div');
  el.className = 'postit-ghost';
  el.dataset.taskId = task.task_id;
  el.style.left = task.x_pct + '%';
  el.style.top = task.y_pct + '%';

  const pClass = 'p' + (task.priority || 3);
  const code = extractCode(task.task_id);
  const countdown = formatCountdown(task.due_at);

  el.innerHTML =
    '<div class="postit-header ' +
    pClass +
    '">' +
    '  <span class="postit-code">' +
    escapeHtml(code) +
    '</span>' +
    '  <span class="postit-countdown">' +
    escapeHtml(countdown) +
    '</span>' +
    '</div>' +
    '<div class="postit-body">' +
    '  <div class="postit-title">' +
    escapeHtml(task.title) +
    '</div>' +
    '</div>' +
    '<div class="postit-accent ' +
    pClass +
    '"></div>';

  el.addEventListener('mousedown', onDragStart);

  return el;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function onDragStart(e) {
  if (e.button !== 0) {
    return;
  }
  const el = e.currentTarget;
  el.classList.add('dragging');

  const rect = el.getBoundingClientRect();
  dragState = {
    el: el,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
  };

  e.preventDefault();
}

function onDragMove(e) {
  if (!dragState) {
    return;
  }
  const canvas = document.getElementById('overlayCanvas');
  const canvasRect = canvas.getBoundingClientRect();

  let newX = e.clientX - dragState.offsetX;
  let newY = e.clientY - dragState.offsetY;

  // Clamp within canvas
  newX = Math.max(canvasRect.left, Math.min(newX, canvasRect.right - 220));
  newY = Math.max(canvasRect.top, Math.min(newY, canvasRect.bottom - 80));

  const xPct = ((newX - canvasRect.left) / canvasRect.width) * 100;
  const yPct = ((newY - canvasRect.top) / canvasRect.height) * 100;

  dragState.el.style.left = xPct + '%';
  dragState.el.style.top = yPct + '%';
}

function onDragEnd() {
  if (!dragState) {
    return;
  }
  dragState.el.classList.remove('dragging');
  dragState = null;
}

function collectPositions() {
  const ghosts = document.querySelectorAll('.postit-ghost');
  const positions = [];
  for (let i = 0; i < ghosts.length; i++) {
    const ghost = ghosts[i];
    positions.push({
      taskId: ghost.dataset.taskId,
      displayId: currentDisplayId,
      xPct: parseFloat(ghost.style.left),
      yPct: parseFloat(ghost.style.top),
    });
  }
  return positions;
}

function init(data) {
  pinnedTasks = data.pinnedTasks || [];
  currentDisplayId = data.displayId || 'default';
  const canvas = document.getElementById('overlayCanvas');
  canvas.innerHTML = '';

  for (let i = 0; i < pinnedTasks.length; i++) {
    canvas.appendChild(createPostitGhost(pinnedTasks[i]));
  }
}

document.addEventListener('mousemove', onDragMove);
document.addEventListener('mouseup', onDragEnd);

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') {
    window.overlayApi.cancel();
  }
});

document.getElementById('btnSave').addEventListener('click', function () {
  const positions = collectPositions();
  window.overlayApi.savePositions(positions);
});

document.getElementById('btnCancel').addEventListener('click', function () {
  window.overlayApi.cancel();
});

// Init i18n before registering overlay data handler to avoid race condition
initI18n(window.overlayApi).then(function () {
  window.overlayApi.onInit(function (data) {
    init(data);
  });
});

'use strict';

function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  document.getElementById('clock').textContent = `${h}:${m}`;

  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  document.getElementById('clockDate').textContent = now.toLocaleDateString('it-IT', options);
}

function formatCountdown(hoursRemaining) {
  if (hoursRemaining === null) {
    return '';
  }
  if (hoursRemaining < 0) {
    return 'scaduto';
  }
  if (hoursRemaining < 1) {
    return `${Math.round(hoursRemaining * 60)}m`;
  }
  if (hoursRemaining < 24) {
    const hrs = Math.floor(hoursRemaining);
    const mins = Math.round((hoursRemaining - hrs) * 60);
    return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
  }
  if (hoursRemaining < 48) {
    return 'domani';
  }
  return `${Math.round(hoursRemaining / 24)} giorni`;
}

function renderUrgencyBar(globalScore, palette) {
  const bar = document.getElementById('urgencyBar');
  bar.style.width = `${globalScore * 100}%`;
  bar.style.backgroundColor = palette.accent_hex;

  document.getElementById('urgencyLabel').textContent = palette.label;
  document.getElementById('urgencyScore').textContent = globalScore.toFixed(2);
}

function renderTaskList(tasks, palette) {
  const container = document.getElementById('tasksContainer');
  container.innerHTML = '';

  if (!tasks || tasks.length === 0) {
    container.innerHTML = '<div class="empty-state">Nessun task in arrivo</div>';
    return;
  }

  const gcalTasks = tasks.filter(function(t) { return t.source === 'gcal'; });
  const jiraTasks = tasks.filter(function(t) { return t.source === 'jira'; });

  if (gcalTasks.length > 0) {
    renderSection(container, 'Google Calendar', gcalTasks, palette);
  }
  if (jiraTasks.length > 0) {
    renderSection(container, 'Jira', jiraTasks, palette);
  }
}

function urgencyToColor(score) {
  const hue = Math.round(160 - score * 160);
  const sat = Math.round(35 + score * 25);
  const light = Math.round(30 + score * 15);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

function renderSection(container, title, tasks, _palette) {
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = title;
  container.appendChild(label);

  for (const task of tasks) {
    const card = document.createElement('div');
    card.className = 'task-card';

    const color = urgencyToColor(task.urgency_score);
    card.style.borderLeftColor = color;

    const isCritical = task.urgency_score > 0.8;
    const countdown = formatCountdown(task.hours_remaining);

    const categoryBadge = task.ai_category
      ? `<span class="task-category">${task.ai_category}</span>`
      : '';

    card.innerHTML =
      '<div class="task-header">' +
        '<div class="task-title">' + escapeHtml(task.title) + '</div>' +
        '<div class="task-countdown" style="color: ' + color + '">' +
          countdown +
          ' <span class="task-dot' + (isCritical ? ' critical' : '') +
          '" style="background: ' + color + '"></span>' +
        '</div>' +
      '</div>' +
      '<div class="task-meta">' +
        task.source + (task.priority ? ' · P' + task.priority : '') +
        categoryBadge +
      '</div>';

    container.appendChild(card);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

updateClock();
setInterval(updateClock, 1000);

document.getElementById('btnSync').addEventListener('click', function() {
  window.deadlineAura.syncNow();
  document.getElementById('syncStatus').textContent = 'sync...';
});

document.getElementById('btnConfig').addEventListener('click', function() {
  window.deadlineAura.openConfig();
});

window.deadlineAura.onUpdate(function(data) {
  renderUrgencyBar(data.engineResult.global_score, data.palette);
  renderTaskList(data.engineResult.tasks, data.palette);
  document.getElementById('syncStatus').textContent = 'aggiornato';
});

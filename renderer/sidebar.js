'use strict';

/* global t, _i18nReady, initI18n, formatElapsed, localStorage,
   updateShiftCountdown, setShiftConfig, extractJiraKey, buildEventSummary,
   formatScore100, flybyStateKey, formatSyncStatus, isFlybySuppressed,
   buildForecastColumns, buildScoreBreakdownHtml,
   TimerController, renderTaskList, commitPendingDelete */

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

const timerController = new TimerController({
  state: sidebarState,
  storage: localStorage,
  getApi: () => window.deadlineAura,
  now: () => new Date(),
  rerender,
  summaryFor: (task) => buildEventSummary(extractJiraKey(task.title), task.title),
  formatElapsed,
  root: document,
});

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

// Closing or reloading the sidebar inside the undo window must still delete the task.
window.addEventListener('pagehide', commitPendingDelete);
window.addEventListener('beforeunload', commitPendingDelete);

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
timerController.restore();

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

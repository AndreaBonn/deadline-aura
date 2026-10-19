'use strict';

/* global t, _i18nReady, initI18n, formatElapsed, localStorage,
   updateShiftCountdown, setShiftConfig, extractJiraKey, buildEventSummary,
   formatScore100, formatSyncStatus, applyFlybyIcon, initFlybyToggle,
   renderClinicalNote, renderStressForecast, updateAiNotesToggle, initAiNotesToggle,
   initScoreBreakdown, TimerController, renderTaskList, commitPendingDelete */

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

document.getElementById('btnClose').addEventListener('click', function () {
  window.deadlineAura.toggleSidebar();
});

initAiNotesToggle();
initScoreBreakdown();
initFlybyToggle();

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

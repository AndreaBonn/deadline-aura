'use strict';

/* global settingsApi, initI18n, t, isConfigDirty, tabForIssuePath, describeSaveError,
   refreshSourceStatus, renderSorgenti, renderGenerale, renderAI, renderWallpaper, renderLimiti,
   renderSidebar, renderNotifiche, renderUI, renderTurno, renderAvanzate */

let config = {};
let savedConfig = {};
let defaults = {};
// Connections first: it is the tab a new user needs on day one.
let activeTab = 'sorgenti';

const content = document.getElementById('settingsContent');
const feedback = document.getElementById('saveFeedback');
const dirtyIndicator = document.getElementById('dirtyIndicator');
const unsavedDialog = document.getElementById('unsavedDialog');
const FEEDBACK_MS = 2000;

// Tabs fill in missing config blocks when they render. Until the user edits something,
// every render refreshes the saved snapshot, so those fills never count as changes.
let userTouched = false;
const NON_EDITING_CONTROLS = '.link-btn--external, .secret-toggle, summary, .setup-steps button';

function updateDirtyState() {
  const dirty = userTouched && isConfigDirty(config, savedConfig);
  dirtyIndicator.hidden = !dirty;
  return dirty;
}

function markTouched(e) {
  const inContent = content.contains(e.target) || e.target.id === 'btnReset';
  if (!inContent) {
    return;
  }
  if (
    e.type === 'click' &&
    (!e.target.closest('button') || e.target.closest(NON_EDITING_CONTROLS))
  ) {
    return;
  }
  userTouched = true;
}

// Capture phase: the flag is set before the field handlers mutate config and re-render.
['input', 'change', 'click'].forEach((type) => {
  document.addEventListener(type, markTouched, true);
  document.addEventListener(type, () => setTimeout(updateDirtyState, 0));
});

// Re-rendering on a blur would swap the DOM under the pointer and swallow the click
// that caused the blur: while a pointer is down, render once after it is released.
// The click fires before the zero-delay timeout queued on pointerup, so it lands first.
let pointerIsDown = false;
let renderAfterPointer = false;
document.addEventListener('pointerdown', () => {
  pointerIsDown = true;
});
document.addEventListener('pointerup', () => {
  pointerIsDown = false;
  if (renderAfterPointer) {
    renderAfterPointer = false;
    setTimeout(renderTab, 0);
  }
});

function renderTabSoon() {
  if (pointerIsDown) {
    renderAfterPointer = true;
  } else {
    renderTab();
  }
}

function selectTab(tab) {
  document.querySelectorAll('.nav-item').forEach((b) => {
    const isActive = b.dataset.tab === tab;
    b.classList.toggle('active', isActive);
    b.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
  activeTab = tab;
  renderTab();
  content.scrollTop = 0;
}

// Tab navigation
document.getElementById('settingsNav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (!btn) {
    return;
  }
  selectTab(btn.dataset.tab);
});

async function saveSettings() {
  const result = await settingsApi.saveConfig(config);
  if (result.ok) {
    savedConfig = JSON.parse(JSON.stringify(config));
    userTouched = false;
    updateDirtyState();
    refreshSourceStatus(settingsApi);
    feedback.classList.remove('save-feedback--error');
    feedback.textContent = t('settings.saved');
    setTimeout(() => {
      feedback.textContent = '';
    }, FEEDBACK_MS);
    return true;
  }
  // The error stays until the next save: the user needs time to find the field.
  feedback.classList.add('save-feedback--error');
  feedback.textContent = describeSaveError(result, t, (tab) =>
    document.querySelector(`.nav-item[data-tab="${tab}"]`).textContent.trim(),
  );
  const issue = (result.issues || [])[0];
  const tab = issue && tabForIssuePath(issue.path);
  if (tab && tab !== activeTab) {
    selectTab(tab);
  }
  return false;
}

document.getElementById('btnClose').addEventListener('click', () => {
  if (updateDirtyState()) {
    unsavedDialog.showModal();
  } else {
    settingsApi.close();
  }
});

document.getElementById('btnSaveAndClose').addEventListener('click', async () => {
  unsavedDialog.close();
  if (await saveSettings()) {
    settingsApi.close();
  }
});
document.getElementById('btnDiscard').addEventListener('click', () => settingsApi.close());
document.getElementById('btnKeepEditing').addEventListener('click', () => unsavedDialog.close());

document.getElementById('btnSave').addEventListener('click', saveSettings);

document.getElementById('btnReset').addEventListener('click', () => {
  const sectionMap = {
    generale: ['sync'],
    sorgenti: ['sources'],
    ai: ['ai'],
    wallpaper: ['wallpaper'],
    sidebar: ['sidebar'],
    notifiche: ['notifications', 'meeting_dock'],
    ui: ['ui', 'language'],
    turno: ['work_shift'],
    avanzate: ['engine'],
  };
  if (activeTab === 'limiti') {
    config.wallpaper.show_ai_usage = defaults.wallpaper.show_ai_usage;
  }
  const sections = sectionMap[activeTab] || [];
  for (const key of sections) {
    if (key === 'language') {
      config.language = defaults.language;
    } else {
      config[key] = JSON.parse(JSON.stringify(defaults[key]));
    }
  }
  renderTab();
});

const renderers = {
  generale: renderGenerale,
  sorgenti: renderSorgenti,
  ai: renderAI,
  wallpaper: renderWallpaper,
  limiti: renderLimiti,
  sidebar: renderSidebar,
  notifiche: renderNotifiche,
  ui: renderUI,
  turno: renderTurno,
  avanzate: renderAvanzate,
};

// What every tab renderer receives. The config is read through getConfig() on each call
// because settings.js reassigns it on load. Event handlers keep the config read at render
// time, so any future reassignment of config must be followed by renderTab().
function createTabContext() {
  return {
    getConfig: () => config,
    defaults,
    api: settingsApi,
    rerender: renderTab,
    rerenderSoon: renderTabSoon,
  };
}

function renderTab() {
  content.innerHTML = '';
  const groups = renderers[activeTab](createTabContext());
  for (const g of groups) {
    content.appendChild(g);
  }
  if (!userTouched) {
    savedConfig = JSON.parse(JSON.stringify(config));
  }
}

// Init
(async () => {
  await initI18n(settingsApi);
  config = await settingsApi.getConfig();
  savedConfig = JSON.parse(JSON.stringify(config));
  defaults = await settingsApi.getDefaults();
  selectTab(activeTab);
})();

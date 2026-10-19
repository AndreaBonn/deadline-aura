'use strict';

/* global settingsApi, createToggle, createNumberInput, createRangeWithValue,
   createSelect, createTextInput, createTagInput, createPriorityList,
   createField, createFieldGroup, createCheckboxGroup, createDateList,
   createTimeSlotList, createVariableMonthGrid, createSecretInput, initI18n, t,
   renderCaptureControl, isConfigDirty, tabForIssuePath, isGoogleConfigured,
   isJiraConfigured, hasAnyAiKey, createNotice, createCollapsible, createGoogleSteps,
   createProviderLabel, AI_PROVIDERS, describeIssue, createSourceStatusBox,
   createActionWithResult, googleAuthMessage, jiraVerifyMessage */

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

function describeSaveError(result) {
  const issue = (result.issues || [])[0];
  if (!issue) {
    return t('settings.save_error_generic');
  }
  const tab = tabForIssuePath(issue.path);
  if (!tab) {
    return t('settings.save_error_generic') + ' (' + issue.path + ')';
  }
  const tabLabel = document.querySelector(`.nav-item[data-tab="${tab}"]`).textContent.trim();
  return t('settings.save_error_tab', { tab: tabLabel, detail: describeIssue(issue, t) });
}

// Rebuilds the status box in place, without re-rendering the fields being edited.
function refreshSourceStatus() {
  const slot = document.getElementById('sourceStatusSlot');
  if (slot) {
    slot.replaceChildren(createSourceStatusBox(settingsApi));
  }
}

async function saveSettings() {
  const result = await settingsApi.saveConfig(config);
  if (result.ok) {
    savedConfig = JSON.parse(JSON.stringify(config));
    userTouched = false;
    updateDirtyState();
    refreshSourceStatus();
    feedback.classList.remove('save-feedback--error');
    feedback.textContent = t('settings.saved');
    setTimeout(() => {
      feedback.textContent = '';
    }, FEEDBACK_MS);
    return true;
  }
  // The error stays until the next save: the user needs time to find the field.
  feedback.classList.add('save-feedback--error');
  feedback.textContent = describeSaveError(result);
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

// Section renderers
function renderGenerale() {
  const group = createFieldGroup(t('settings.sync_group'));
  group.append(
    createField(
      t('settings.data_interval'),
      createNumberInput(
        config.sync.data_interval_minutes || defaults.sync.data_interval_minutes,
        { min: 1, max: 60 },
        (v) => {
          config.sync.data_interval_minutes = v;
        },
      ),
      t('settings.data_interval_hint'),
    ),
    createField(
      t('settings.lookahead_window'),
      createNumberInput(config.sync.lookahead_hours, { min: 1, max: 720 }, (v) => {
        config.sync.lookahead_hours = v;
      }),
      t('settings.lookahead_hint'),
    ),
  );
  return [group];
}

function renderSorgenti() {
  if (!config.sources.google_calendar.oauth) {
    config.sources.google_calendar.oauth = { client_id: '', client_secret: '' };
  }
  const gcalCfg = config.sources.google_calendar;
  const gcal = createFieldGroup(t('sidebar.google_calendar'));
  gcal.appendChild(
    createField(
      t('common.enabled'),
      createToggle(gcalCfg.enabled, (v) => {
        gcalCfg.enabled = v;
        renderTab();
      }),
    ),
  );
  if (gcalCfg.enabled && !isGoogleConfigured(gcalCfg)) {
    gcal.appendChild(createNotice(t('settings.source_needs_setup'), 'warn'));
  }
  if (!isGoogleConfigured(gcalCfg)) {
    gcal.appendChild(createGoogleSteps(settingsApi));
  }
  // Filling both credentials switches the source on: that is why they were typed in.
  const enableWhenConfigured = () => {
    if (!gcalCfg.enabled && isGoogleConfigured(gcalCfg)) {
      gcalCfg.enabled = true;
      renderTabSoon();
    }
  };
  gcal.append(
    createField(
      t('settings.google_client_id'),
      createTextInput(
        gcalCfg.oauth.client_id || '',
        { placeholder: t('settings.google_client_id_placeholder') },
        (v) => {
          gcalCfg.oauth.client_id = v;
          enableWhenConfigured();
        },
      ),
      t('settings.google_oauth_hint'),
    ),
    createField(
      t('settings.google_client_secret'),
      createSecretInput(
        gcalCfg.oauth.client_secret || '',
        { placeholder: t('settings.client_secret_placeholder') },
        (v) => {
          gcalCfg.oauth.client_secret = v;
          enableWhenConfigured();
        },
      ),
    ),
    createField(
      t('settings.google_authorize'),
      createActionWithResult({
        label: t('settings.google_authorize_btn'),
        busyLabel: t('settings.google_authorize_wait'),
        run: async () => {
          // Authorization uses the saved credentials: save pending edits first.
          if (updateDirtyState() && !(await saveSettings())) {
            return null;
          }
          const outcome = googleAuthMessage(await settingsApi.authorizeGoogle(), t);
          refreshSourceStatus();
          return outcome;
        },
      }),
      t('settings.google_authorize_hint'),
    ),
    createCollapsible(t('settings.more_options'), t('settings.google_more_options'), [
      createField(
        t('settings.calendars'),
        createTagInput(
          gcalCfg.calendars,
          { placeholder: t('settings.calendar_id_placeholder') },
          (v) => {
            gcalCfg.calendars = v;
          },
        ),
      ),
      createField(
        t('settings.priority_keywords'),
        createTagInput(
          gcalCfg.priority_keywords,
          { placeholder: t('settings.keyword_placeholder') },
          (v) => {
            gcalCfg.priority_keywords = v;
          },
        ),
      ),
      createField(
        t('settings.google_account'),
        createTextInput(
          gcalCfg.google_account || '',
          { placeholder: t('settings.google_account_placeholder') },
          (v) => {
            gcalCfg.google_account = v;
          },
        ),
        t('settings.google_account_hint'),
      ),
    ]),
  );

  if (!config.sources.outlook) {
    config.sources.outlook = { enabled: false, ics_url: '', priority_keywords: [] };
  }
  const outlook = createFieldGroup(t('sidebar.outlook'));
  outlook.append(
    createField(
      t('common.enabled'),
      createToggle(config.sources.outlook.enabled, (v) => {
        config.sources.outlook.enabled = v;
      }),
    ),
    createField(
      t('settings.outlook_ics_url'),
      createSecretInput(
        config.sources.outlook.ics_url || '',
        { placeholder: t('settings.outlook_ics_url_placeholder') },
        (v) => {
          config.sources.outlook.ics_url = v;
          if (v.trim() && !config.sources.outlook.enabled) {
            config.sources.outlook.enabled = true;
            renderTabSoon();
          }
        },
      ),
      t('settings.outlook_ics_url_hint'),
    ),
    createField(
      t('settings.priority_keywords'),
      createTagInput(
        config.sources.outlook.priority_keywords,
        { placeholder: t('settings.keyword_placeholder') },
        (v) => {
          config.sources.outlook.priority_keywords = v;
        },
      ),
    ),
  );

  const status = document.createElement('div');
  status.id = 'sourceStatusSlot';
  status.appendChild(createSourceStatusBox(settingsApi));
  return [status, gcal, outlook, renderJiraGroup()];
}

function renderJiraGroup() {
  const jiraCfg = config.sources.jira;
  if (!jiraCfg.instances) {
    jiraCfg.instances = [];
  }
  const instances = jiraCfg.instances;
  const jira = createFieldGroup(t('sidebar.jira'));
  jira.appendChild(
    createField(
      t('common.enabled'),
      createToggle(jiraCfg.enabled, (v) => {
        jiraCfg.enabled = v;
        renderTab();
      }),
    ),
  );
  if (jiraCfg.enabled && !isJiraConfigured(jiraCfg)) {
    jira.appendChild(createNotice(t('settings.jira_needs_instance'), 'warn'));
  }

  const jqlInput = createTextInput(
    jiraCfg.jql,
    { placeholder: t('settings.jql_placeholder') },
    (v) => {
      jiraCfg.jql = v;
    },
  );
  const jqlWrap = document.createElement('div');
  jqlWrap.className = 'field-input field-input--stack';
  const jqlReset = document.createElement('button');
  jqlReset.type = 'button';
  jqlReset.className = 'link-btn';
  jqlReset.textContent = t('settings.jql_reset');
  jqlReset.addEventListener('click', () => {
    jiraCfg.jql = defaults.sources.jira.jql;
    renderTab();
  });
  jqlWrap.append(jqlInput, jqlReset);
  jira.appendChild(createField(t('settings.jql'), jqlWrap, t('settings.jql_hint')));

  const enableWhenConfigured = () => {
    if (!jiraCfg.enabled && isJiraConfigured(jiraCfg)) {
      jiraCfg.enabled = true;
      renderTabSoon();
    }
  };
  for (let i = 0; i < instances.length; i++) {
    const card = document.createElement('div');
    card.className = 'instance-card';
    const header = document.createElement('div');
    header.className = 'instance-header';
    const title = document.createElement('span');
    title.className = 'instance-title';
    title.textContent = t('settings.instance_n', { n: i + 1 });
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn--danger';
    removeBtn.textContent = t('common.remove');
    removeBtn.addEventListener('click', () => {
      instances.splice(i, 1);
      renderTab();
    });
    header.append(title, removeBtn);
    card.appendChild(header);
    card.append(
      createField(
        t('settings.jira_domain'),
        createTextInput(instances[i].domain, { placeholder: 'azienda.atlassian.net' }, (v) => {
          instances[i].domain = v;
          enableWhenConfigured();
        }),
      ),
      createField(
        t('settings.jira_email'),
        createTextInput(instances[i].email, {}, (v) => {
          instances[i].email = v;
          enableWhenConfigured();
        }),
      ),
      createField(
        t('settings.jira_api_token'),
        createSecretInput(
          instances[i].api_token,
          { placeholder: t('settings.api_key_placeholder') },
          (v) => {
            instances[i].api_token = v;
            enableWhenConfigured();
          },
        ),
      ),
    );
    card.appendChild(
      createActionWithResult({
        label: t('settings.jira_verify_btn'),
        busyLabel: t('settings.jira_verify_wait'),
        run: async () => {
          const inst = instances[i];
          const result = await settingsApi.verifyJira(i, {
            domain: inst.domain,
            email: inst.email,
            api_token: inst.api_token,
            jql: jiraCfg.jql,
          });
          return jiraVerifyMessage(result, t);
        },
      }),
    );
    jira.appendChild(card);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--secondary btn--small';
  addBtn.textContent = t('settings.add_instance');
  addBtn.addEventListener('click', () => {
    instances.push({ domain: '', email: '', api_token: '' });
    renderTab();
  });
  jira.appendChild(addBtn);
  return jira;
}

function renderAI() {
  if (!config.ai.api_keys) {
    config.ai.api_keys = { groq: '', gemini: '', openai: '', anthropic: '' };
  }
  const groups = [];
  if (config.ai.enabled && !hasAnyAiKey(config.ai.api_keys)) {
    const banner = document.createElement('div');
    banner.appendChild(createNotice(t('settings.ai_off_banner'), 'warn'));
    groups.push(banner);
  }

  const keys = createFieldGroup(t('settings.ai_api_keys'));
  const intro = document.createElement('p');
  intro.className = 'settings-intro';
  intro.textContent = t('settings.ai_keys_intro');
  keys.appendChild(intro);
  for (const provider of AI_PROVIDERS) {
    const field = document.createElement('div');
    field.className = 'field';
    field.append(
      createProviderLabel(provider, settingsApi),
      createSecretInput(
        config.ai.api_keys[provider.id] || '',
        { placeholder: t('settings.api_key_placeholder') },
        (v) => {
          config.ai.api_keys[provider.id] = v;
        },
      ),
    );
    keys.appendChild(field);
  }
  groups.push(keys);

  const group = createFieldGroup(t('settings.ai_scoring'));
  group.append(
    createField(
      t('common.enabled'),
      createToggle(config.ai.enabled, (v) => {
        config.ai.enabled = v;
        renderTab();
      }),
    ),
    createField(
      t('settings.recalc_every'),
      createNumberInput(config.ai.recalc_hours, { min: 1, max: 24 }, (v) => {
        config.ai.recalc_hours = v;
      }),
      t('settings.hours'),
    ),
    createCollapsible(t('settings.ai_advanced'), t('settings.ai_advanced_hint'), [
      createField(
        t('settings.provider_priority'),
        createPriorityList(config.ai.provider_priority, (v) => {
          config.ai.provider_priority = v;
        }),
      ),
      createField(
        t('settings.timeout'),
        createNumberInput(
          config.ai.provider_timeout_ms,
          { min: 1000, max: 30000, step: 1000 },
          (v) => {
            config.ai.provider_timeout_ms = v;
          },
        ),
        t('settings.milliseconds'),
      ),
      createField(
        t('settings.temperature'),
        createRangeWithValue(config.ai.temperature, { min: 0, max: 1, step: 0.05 }, (v) => {
          config.ai.temperature = v;
        }),
      ),
    ]),
  );
  groups.push(group);
  return groups;
}

function renderWallpaper() {
  const group = createFieldGroup(t('settings.tabs.wallpaper'));
  group.append(
    createField(
      t('common.enabled'),
      createToggle(config.wallpaper.enabled, (v) => {
        config.wallpaper.enabled = v;
      }),
    ),
    createField(
      t('settings.min_score_delta'),
      createRangeWithValue(
        config.wallpaper.min_score_delta,
        { min: 0, max: 0.5, step: 0.01 },
        (v) => {
          config.wallpaper.min_score_delta = v;
        },
      ),
      t('settings.min_score_delta_hint'),
    ),
    createField(
      t('settings.show_text'),
      createToggle(config.wallpaper.show_text, (v) => {
        config.wallpaper.show_text = v;
      }),
    ),
  );
  group.append(
    createField(
      t('settings.photo_backgrounds'),
      createToggle(config.wallpaper.use_backgrounds, (v) => {
        config.wallpaper.use_backgrounds = v;
      }),
    ),
    createField(
      t('settings.resolution'),
      createSelect(
        config.wallpaper.resolution === 'auto' ? 'auto' : 'custom',
        [
          { value: 'auto', label: t('settings.auto') },
          { value: 'custom', label: t('settings.custom') },
        ],
        (v) => {
          if (v === 'auto') {
            config.wallpaper.resolution = 'auto';
          }
          renderTab();
        },
      ),
    ),
  );

  if (config.wallpaper.resolution !== 'auto') {
    group.appendChild(
      createField(
        t('settings.custom_resolution'),
        createTextInput(config.wallpaper.resolution, { placeholder: '1920x1080' }, (v) => {
          config.wallpaper.resolution = v;
        }),
      ),
    );
  }

  const postit = createFieldGroup(t('settings.postit'));
  postit.append(
    createField(
      t('settings.postit_enabled'),
      createToggle(config.wallpaper.postit.enabled, (v) => {
        config.wallpaper.postit.enabled = v;
      }),
    ),
    createField(
      t('settings.max_per_display'),
      createNumberInput(config.wallpaper.postit.max_per_display, { min: 1, max: 20 }, (v) => {
        config.wallpaper.postit.max_per_display = v;
      }),
    ),
  );
  return [group, postit];
}

// Claude/Codex usage band and its statusline capture: a niche, kept out of Wallpaper.
function renderLimiti() {
  const group = createFieldGroup(t('settings.tabs.ai_usage'));
  group.appendChild(
    createField(
      t('settings.show_ai_usage'),
      createToggle(config.wallpaper.show_ai_usage, (v) => {
        config.wallpaper.show_ai_usage = v;
      }),
    ),
  );
  const captureContainer = document.createElement('div');
  renderCaptureControl(captureContainer, settingsApi, t);
  group.appendChild(captureContainer);
  return [group];
}

function renderSidebar() {
  const group = createFieldGroup(t('settings.tabs.sidebar'));
  group.append(
    createField(
      t('settings.position'),
      createSelect(
        config.sidebar.position,
        [
          { value: 'left', label: t('settings.left') },
          { value: 'right', label: t('settings.right') },
        ],
        (v) => {
          config.sidebar.position = v;
        },
      ),
    ),
    createField(
      t('settings.width'),
      createNumberInput(config.sidebar.width, { min: 200, max: 400 }, (v) => {
        config.sidebar.width = v;
      }),
      t('settings.pixels'),
    ),
    createField(
      t('settings.opacity'),
      createRangeWithValue(config.sidebar.opacity, { min: 0.1, max: 1, step: 0.05 }, (v) => {
        config.sidebar.opacity = v;
      }),
    ),
  );
  return [group];
}

function renderNotifiche() {
  const group = createFieldGroup(t('settings.notifications_group'));
  group.append(
    createField(
      t('settings.notifications_enabled'),
      createToggle(config.notifications.enabled, (v) => {
        config.notifications.enabled = v;
      }),
    ),
    createField(
      t('settings.score_threshold'),
      createRangeWithValue(
        config.notifications.threshold_score,
        { min: 0, max: 1, step: 0.05 },
        (v) => {
          config.notifications.threshold_score = v;
        },
      ),
      t('settings.score_threshold_hint'),
    ),
    createField(
      t('settings.cooldown'),
      createNumberInput(config.notifications.cooldown_minutes, { min: 1, max: 1440 }, (v) => {
        config.notifications.cooldown_minutes = v;
      }),
      t('settings.cooldown_hint'),
    ),
  );

  if (!config.meeting_dock) {
    config.meeting_dock = { enabled: true, lookahead_minutes: 10 };
  }
  const dockGroup = createFieldGroup(t('settings.meeting_dock_group'));
  dockGroup.append(
    createField(
      t('common.enabled'),
      createToggle(config.meeting_dock.enabled, (v) => {
        config.meeting_dock.enabled = v;
      }),
    ),
    createField(
      t('settings.meeting_dock_lookahead'),
      createNumberInput(config.meeting_dock.lookahead_minutes, { min: 1, max: 30 }, (v) => {
        config.meeting_dock.lookahead_minutes = v;
      }),
      t('settings.meeting_dock_lookahead_hint'),
    ),
  );
  return [group, dockGroup];
}

function renderUI() {
  const group = createFieldGroup(t('settings.ui_group'));
  group.append(
    createField(
      t('settings.language'),
      createSelect(
        config.language || 'it',
        [
          { value: 'it', label: 'Italiano' },
          { value: 'en', label: 'English' },
        ],
        (v) => {
          config.language = v;
        },
      ),
      t('settings.language_hint'),
    ),
    createField(
      t('settings.max_tasks_shown'),
      createNumberInput(config.ui.max_tasks_shown, { min: 1, max: 20 }, (v) => {
        config.ui.max_tasks_shown = v;
      }),
    ),
    createField(
      t('settings.source_badge'),
      createToggle(config.ui.show_source_badge, (v) => {
        config.ui.show_source_badge = v;
      }),
      t('settings.source_badge_hint'),
    ),
    createField(
      t('settings.countdown_format'),
      createSelect(
        config.ui.countdown_format,
        [
          { value: 'relative', label: t('settings.relative') },
          { value: 'absolute', label: t('settings.absolute') },
          { value: 'both', label: t('settings.both') },
        ],
        (v) => {
          config.ui.countdown_format = v;
        },
      ),
    ),
  );
  return [group];
}

function renderAvanzate() {
  const group = createFieldGroup(t('settings.engine'));
  group.append(
    createField(
      t('settings.k_constant'),
      createRangeWithValue(config.engine.k_constant, { min: 0.01, max: 1, step: 0.01 }, (v) => {
        config.engine.k_constant = v;
      }),
      t('settings.k_constant_hint'),
    ),
  );

  const weights = config.engine.priority_weights;
  const labelKeys = [
    'priorities.critical',
    'priorities.high',
    'priorities.medium',
    'priorities.low',
  ];
  for (let i = 0; i < 4; i++) {
    group.appendChild(
      createField(
        t('settings.weight_label', { label: t(labelKeys[i]) }),
        createNumberInput(weights[i], { min: 0, max: 5, step: 0.1 }, (v) => {
          config.engine.priority_weights[i] = v;
        }),
      ),
    );
  }
  return [group];
}

function ensureWorkShift() {
  if (!config.work_shift) {
    config.work_shift = JSON.parse(JSON.stringify(defaults.work_shift));
  }
  return config.work_shift;
}

function renderTurno() {
  const ws = ensureWorkShift();

  const mainGroup = createFieldGroup(t('settings.work_shift_group'));
  mainGroup.append(
    createField(
      t('settings.work_shift_enabled'),
      createToggle(ws.enabled, (v) => {
        ws.enabled = v;
        renderTab();
      }),
      t('settings.work_shift_enabled_hint'),
    ),
  );

  if (!ws.enabled) {
    return [mainGroup];
  }

  mainGroup.append(
    createField(
      t('settings.work_shift_mode'),
      createSelect(
        ws.mode,
        [
          { value: 'regular', label: t('settings.work_shift_mode_regular') },
          { value: 'variable', label: t('settings.work_shift_mode_variable') },
        ],
        (v) => {
          ws.mode = v;
          renderTab();
        },
      ),
    ),
  );

  if (ws.mode === 'regular') {
    const regularGroup = createFieldGroup(t('settings.work_shift_work_days'));
    regularGroup.appendChild(
      createCheckboxGroup(
        ws.regular.work_days,
        [0, 1, 2, 3, 4, 5, 6].map((d) => ({
          value: d,
          label: t(`settings.work_shift_day_short_${d}`),
        })),
        (v) => {
          ws.regular.work_days = v;
        },
      ),
    );

    const slotsGroup = createFieldGroup(t('settings.work_shift_slots'));
    slotsGroup.appendChild(
      createTimeSlotList(ws.regular.slots, (v) => {
        ws.regular.slots = v;
      }),
    );

    const holidaysGroup = createFieldGroup(t('settings.work_shift_holidays'));
    holidaysGroup.appendChild(
      createDateList(ws.regular.holidays, (v) => {
        ws.regular.holidays = v;
      }),
    );

    return [mainGroup, regularGroup, slotsGroup, holidaysGroup];
  }

  // Variable mode
  const variableGroup = createFieldGroup(t('settings.work_shift_mode_variable'));
  const hint = document.createElement('div');
  hint.className = 'field-hint';
  hint.style.marginBottom = '12px';
  hint.textContent = t('settings.work_shift_variable_hint');
  variableGroup.appendChild(hint);

  if (!ws.variable) {
    ws.variable = { months: {} };
  }

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const nextDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}`;

  for (const monthKey of [currentMonth, nextMonth]) {
    if (!ws.variable.months[monthKey]) {
      ws.variable.months[monthKey] = {};
    }
    variableGroup.appendChild(
      createVariableMonthGrid(monthKey, ws.variable.months[monthKey], (updated) => {
        ws.variable.months[monthKey] = updated;
      }),
    );
  }

  return [mainGroup, variableGroup];
}

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

function renderTab() {
  content.innerHTML = '';
  const groups = renderers[activeTab]();
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

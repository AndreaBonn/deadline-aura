'use strict';

/* global settingsApi, createToggle, createNumberInput, createRangeWithValue,
   createSelect, createTextInput, createTagInput, createPriorityList,
   createField, createFieldGroup, createCheckboxGroup, createDateList,
   createTimeSlotList, createVariableMonthGrid, initI18n, t */

let config = {};
let defaults = {};
let activeTab = 'generale';

const content = document.getElementById('settingsContent');
const feedback = document.getElementById('saveFeedback');

// Tab navigation
document.getElementById('settingsNav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (!btn) {
    return;
  }
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  activeTab = btn.dataset.tab;
  renderTab();
});

document.getElementById('btnClose').addEventListener('click', () => settingsApi.close());

document.getElementById('btnSave').addEventListener('click', async () => {
  const result = await settingsApi.saveConfig(config);
  if (result.ok) {
    feedback.textContent = t('settings.saved');
    setTimeout(() => {
      feedback.textContent = '';
    }, 2000);
  } else {
    feedback.textContent = t('settings.validation_error');
    feedback.style.color = 'rgba(255, 80, 80, 0.8)';
    setTimeout(() => {
      feedback.textContent = '';
      feedback.style.color = '';
    }, 3000);
  }
});

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
      t('settings.sync_interval'),
      createNumberInput(config.sync.interval_minutes, { min: 1, max: 60 }, (v) => {
        config.sync.interval_minutes = v;
      }),
      t('settings.sync_interval_hint'),
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
  const gcal = createFieldGroup(t('sidebar.google_calendar'));
  gcal.append(
    createField(
      t('common.enabled'),
      createToggle(config.sources.google_calendar.enabled, (v) => {
        config.sources.google_calendar.enabled = v;
      }),
    ),
    createField(
      t('settings.calendars'),
      createTagInput(
        config.sources.google_calendar.calendars,
        { placeholder: t('settings.calendar_id_placeholder') },
        (v) => {
          config.sources.google_calendar.calendars = v;
        },
      ),
    ),
    createField(
      t('settings.priority_keywords'),
      createTagInput(
        config.sources.google_calendar.priority_keywords,
        { placeholder: t('settings.keyword_placeholder') },
        (v) => {
          config.sources.google_calendar.priority_keywords = v;
        },
      ),
    ),
    createField(
      t('settings.google_account'),
      createTextInput(
        config.sources.google_calendar.google_account || '',
        { placeholder: t('settings.google_account_placeholder') },
        (v) => {
          config.sources.google_calendar.google_account = v;
        },
      ),
      t('settings.google_account_hint'),
    ),
  );

  const jira = createFieldGroup(t('sidebar.jira'));
  jira.append(
    createField(
      t('common.enabled'),
      createToggle(config.sources.jira.enabled, (v) => {
        config.sources.jira.enabled = v;
      }),
    ),
    createField(
      t('settings.jql'),
      createTextInput(
        config.sources.jira.jql,
        { placeholder: t('settings.jql_placeholder') },
        (v) => {
          config.sources.jira.jql = v;
        },
      ),
    ),
  );

  // Jira instances
  const instances = config.sources.jira.instances || [];
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
        createTextInput(instances[i].domain, {}, (v) => {
          instances[i].domain = v;
        }),
      ),
      createField(
        t('settings.jira_email'),
        createTextInput(instances[i].email, {}, (v) => {
          instances[i].email = v;
        }),
      ),
      createField(
        t('settings.jira_api_token'),
        createTextInput(instances[i].api_token, {}, (v) => {
          instances[i].api_token = v;
        }),
      ),
    );
    jira.appendChild(card);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--secondary btn--small';
  addBtn.textContent = t('settings.add_instance');
  addBtn.addEventListener('click', () => {
    if (!config.sources.jira.instances) {
      config.sources.jira.instances = [];
    }
    config.sources.jira.instances.push({ domain: '', email: '', api_token: '' });
    renderTab();
  });
  jira.appendChild(addBtn);

  return [gcal, jira];
}

function renderAI() {
  const group = createFieldGroup(t('settings.ai_scoring'));
  group.append(
    createField(
      t('common.enabled'),
      createToggle(config.ai.enabled, (v) => {
        config.ai.enabled = v;
      }),
    ),
    createField(
      t('settings.provider_priority'),
      createPriorityList(config.ai.provider_priority, (v) => {
        config.ai.provider_priority = v;
      }),
    ),
    createField(
      t('settings.recalc_every'),
      createNumberInput(config.ai.recalc_hours, { min: 1, max: 24 }, (v) => {
        config.ai.recalc_hours = v;
      }),
      t('settings.hours'),
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
  );
  return [group];
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
}

// Init
(async () => {
  await initI18n(settingsApi);
  config = await settingsApi.getConfig();
  defaults = await settingsApi.getDefaults();
  renderTab();
})();

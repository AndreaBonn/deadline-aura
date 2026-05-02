'use strict';

/* global settingsApi, createToggle, createNumberInput, createRangeWithValue,
   createSelect, createTextInput, createTagInput, createPriorityList,
   createField, createFieldGroup */

let config = {};
let defaults = {};
let activeTab = 'generale';

const content = document.getElementById('settingsContent');
const feedback = document.getElementById('saveFeedback');

// Tab navigation
document.getElementById('settingsNav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-item');
  if (!btn) { return; }
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  activeTab = btn.dataset.tab;
  renderTab();
});

document.getElementById('btnClose').addEventListener('click', () => settingsApi.close());

document.getElementById('btnSave').addEventListener('click', async () => {
  const result = await settingsApi.saveConfig(config);
  if (result.ok) {
    feedback.textContent = 'Salvato';
    setTimeout(() => { feedback.textContent = ''; }, 2000);
  } else {
    feedback.textContent = 'Errore validazione';
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
    notifiche: ['notifications'],
    ui: ['ui'],
    avanzate: ['engine'],
  };
  const sections = sectionMap[activeTab] || [];
  for (const key of sections) {
    config[key] = JSON.parse(JSON.stringify(defaults[key]));
  }
  renderTab();
});

// Section renderers
function renderGenerale() {
  const group = createFieldGroup('Sincronizzazione');
  group.append(
    createField('Intervallo sync', createNumberInput(
      config.sync.interval_minutes, { min: 1, max: 60 },
      (v) => { config.sync.interval_minutes = v; }
    ), 'Minuti tra ogni sincronizzazione'),
    createField('Finestra lookahead', createNumberInput(
      config.sync.lookahead_hours, { min: 1, max: 720 },
      (v) => { config.sync.lookahead_hours = v; }
    ), 'Ore nel futuro da considerare'),
  );
  return [group];
}

function renderSorgenti() {
  const gcal = createFieldGroup('Google Calendar');
  gcal.append(
    createField('Abilitato', createToggle(
      config.sources.google_calendar.enabled,
      (v) => { config.sources.google_calendar.enabled = v; }
    )),
    createField('Calendari', createTagInput(
      config.sources.google_calendar.calendars, { placeholder: 'ID calendario...' },
      (v) => { config.sources.google_calendar.calendars = v; }
    )),
    createField('Keyword priorità', createTagInput(
      config.sources.google_calendar.priority_keywords, { placeholder: 'Keyword...' },
      (v) => { config.sources.google_calendar.priority_keywords = v; }
    )),
  );

  const jira = createFieldGroup('Jira');
  jira.append(
    createField('Abilitato', createToggle(
      config.sources.jira.enabled,
      (v) => { config.sources.jira.enabled = v; }
    )),
    createField('JQL', createTextInput(
      config.sources.jira.jql, { placeholder: 'JQL query...' },
      (v) => { config.sources.jira.jql = v; }
    )),
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
    title.textContent = `Istanza ${i + 1}`;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn btn--danger';
    removeBtn.textContent = 'Rimuovi';
    removeBtn.addEventListener('click', () => {
      instances.splice(i, 1);
      renderTab();
    });
    header.append(title, removeBtn);
    card.appendChild(header);
    card.append(
      createField('Domain', createTextInput(instances[i].domain, {},
        (v) => { instances[i].domain = v; })),
      createField('Email', createTextInput(instances[i].email, {},
        (v) => { instances[i].email = v; })),
      createField('API Token', createTextInput(instances[i].api_token, {},
        (v) => { instances[i].api_token = v; })),
    );
    jira.appendChild(card);
  }

  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--secondary btn--small';
  addBtn.textContent = '+ Aggiungi istanza';
  addBtn.addEventListener('click', () => {
    if (!config.sources.jira.instances) { config.sources.jira.instances = []; }
    config.sources.jira.instances.push({ domain: '', email: '', api_token: '' });
    renderTab();
  });
  jira.appendChild(addBtn);

  return [gcal, jira];
}

function renderAI() {
  const group = createFieldGroup('AI Scoring');
  group.append(
    createField('Abilitato', createToggle(
      config.ai.enabled,
      (v) => { config.ai.enabled = v; }
    )),
    createField('Priorità provider', createPriorityList(
      config.ai.provider_priority,
      (v) => { config.ai.provider_priority = v; }
    )),
    createField('Ricalcolo ogni', createNumberInput(
      config.ai.recalc_hours, { min: 1, max: 24 },
      (v) => { config.ai.recalc_hours = v; }
    ), 'Ore'),
    createField('Timeout', createNumberInput(
      config.ai.timeout_ms, { min: 1000, max: 30000, step: 1000 },
      (v) => { config.ai.timeout_ms = v; }
    ), 'Millisecondi'),
    createField('Temperature', createRangeWithValue(
      config.ai.temperature, { min: 0, max: 1, step: 0.05 },
      (v) => { config.ai.temperature = v; }
    )),
  );
  return [group];
}

function renderWallpaper() {
  const group = createFieldGroup('Wallpaper');
  group.append(
    createField('Abilitato', createToggle(
      config.wallpaper.enabled,
      (v) => { config.wallpaper.enabled = v; }
    )),
    createField('Delta minimo score', createRangeWithValue(
      config.wallpaper.min_score_delta, { min: 0, max: 0.5, step: 0.01 },
      (v) => { config.wallpaper.min_score_delta = v; }
    ), 'Cambio minimo per aggiornare wallpaper'),
    createField('Mostra testo', createToggle(
      config.wallpaper.show_text,
      (v) => { config.wallpaper.show_text = v; }
    )),
    createField('Sfondi fotografici', createToggle(
      config.wallpaper.use_backgrounds,
      (v) => { config.wallpaper.use_backgrounds = v; }
    )),
    createField('Risoluzione', createSelect(
      config.wallpaper.resolution === 'auto' ? 'auto' : 'custom',
      [{ value: 'auto', label: 'Automatica' }, { value: 'custom', label: 'Personalizzata' }],
      (v) => {
        if (v === 'auto') { config.wallpaper.resolution = 'auto'; }
        renderTab();
      }
    )),
  );

  if (config.wallpaper.resolution !== 'auto') {
    group.appendChild(createField('Risoluzione custom', createTextInput(
      config.wallpaper.resolution, { placeholder: '1920x1080' },
      (v) => { config.wallpaper.resolution = v; }
    )));
  }

  const postit = createFieldGroup('Post-it');
  postit.append(
    createField('Abilitati', createToggle(
      config.wallpaper.postit.enabled,
      (v) => { config.wallpaper.postit.enabled = v; }
    )),
    createField('Max per display', createNumberInput(
      config.wallpaper.postit.max_per_display, { min: 1, max: 20 },
      (v) => { config.wallpaper.postit.max_per_display = v; }
    )),
  );
  return [group, postit];
}

function renderSidebar() {
  const group = createFieldGroup('Sidebar');
  group.append(
    createField('Posizione', createSelect(
      config.sidebar.position,
      [{ value: 'left', label: 'Sinistra' }, { value: 'right', label: 'Destra' }],
      (v) => { config.sidebar.position = v; }
    )),
    createField('Larghezza', createNumberInput(
      config.sidebar.width, { min: 200, max: 400 },
      (v) => { config.sidebar.width = v; }
    ), 'Pixel'),
    createField('Opacità', createRangeWithValue(
      config.sidebar.opacity, { min: 0.1, max: 1, step: 0.05 },
      (v) => { config.sidebar.opacity = v; }
    )),
    createField('Monitor', createTextInput(
      config.sidebar.monitor, { placeholder: 'primary' },
      (v) => { config.sidebar.monitor = v; }
    )),
  );
  return [group];
}

function renderNotifiche() {
  const group = createFieldGroup('Notifiche');
  group.append(
    createField('Abilitate', createToggle(
      config.notifications.enabled,
      (v) => { config.notifications.enabled = v; }
    )),
    createField('Soglia score', createRangeWithValue(
      config.notifications.threshold_score, { min: 0, max: 1, step: 0.05 },
      (v) => { config.notifications.threshold_score = v; }
    ), 'Score minimo per notifica'),
    createField('Cooldown', createNumberInput(
      config.notifications.cooldown_minutes, { min: 1, max: 1440 },
      (v) => { config.notifications.cooldown_minutes = v; }
    ), 'Minuti tra notifiche'),
  );
  return [group];
}

function renderUI() {
  const group = createFieldGroup('Interfaccia');
  group.append(
    createField('Max task visibili', createNumberInput(
      config.ui.max_tasks_shown, { min: 1, max: 20 },
      (v) => { config.ui.max_tasks_shown = v; }
    )),
    createField('Badge sorgente', createToggle(
      config.ui.show_source_badge,
      (v) => { config.ui.show_source_badge = v; }
    ), 'Mostra icona Google/Jira'),
    createField('Formato countdown', createSelect(
      config.ui.countdown_format,
      [
        { value: 'relative', label: 'Relativo (tra 2h)' },
        { value: 'absolute', label: 'Assoluto (15:30)' },
        { value: 'both', label: 'Entrambi' },
      ],
      (v) => { config.ui.countdown_format = v; }
    )),
  );
  return [group];
}

function renderAvanzate() {
  const group = createFieldGroup('Engine');
  group.append(
    createField('Costante K', createRangeWithValue(
      config.engine.k_constant, { min: 0.01, max: 1, step: 0.01 },
      (v) => { config.engine.k_constant = v; }
    ), 'Fattore decadimento urgenza'),
  );

  const weights = config.engine.priority_weights;
  const labels = ['Critico', 'Alto', 'Medio', 'Basso'];
  for (let i = 0; i < 4; i++) {
    group.appendChild(createField(`Peso ${labels[i]}`, createNumberInput(
      weights[i], { min: 0, max: 5, step: 0.1 },
      (v) => { config.engine.priority_weights[i] = v; }
    )));
  }
  return [group];
}

const renderers = {
  generale: renderGenerale,
  sorgenti: renderSorgenti,
  ai: renderAI,
  wallpaper: renderWallpaper,
  sidebar: renderSidebar,
  notifiche: renderNotifiche,
  ui: renderUI,
  avanzate: renderAvanzate,
};

function renderTab() {
  content.innerHTML = '';
  const groups = renderers[activeTab]();
  for (const g of groups) { content.appendChild(g); }
}

// Init
(async () => {
  config = await settingsApi.getConfig();
  defaults = await settingsApi.getDefaults();
  renderTab();
})();

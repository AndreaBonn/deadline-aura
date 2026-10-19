'use strict';

/* global t, createField, createFieldGroup, createToggle, createTextInput, createSecretInput,
   createTagInput, createNotice, createCollapsible, createGoogleSteps, createActionWithResult,
   createSourceStatusBox, isGoogleConfigured, isJiraConfigured, googleAuthMessage,
   jiraVerifyMessage, updateDirtyState, saveSettings */
/* Sources tab: Google Calendar, Outlook and Jira. Rendered with the tab context of settings.js:
   { getConfig, defaults, api, rerender, rerenderSoon }. */

const NEW_JIRA_INSTANCE = { domain: '', email: '', api_token: '' };

// Rebuilds the status box in place, without re-rendering the fields being edited.
function refreshSourceStatus(api) {
  const slot = document.getElementById('sourceStatusSlot');
  if (slot) {
    slot.replaceChildren(createSourceStatusBox(api));
  }
}

function buildEnabledField(sourceCfg, rerender) {
  return createField(
    t('common.enabled'),
    createToggle(sourceCfg.enabled, (v) => {
      sourceCfg.enabled = v;
      rerender();
    }),
  );
}

// Filling the credentials switches the source on: that is why they were typed in.
function createEnableWhenConfigured(sourceCfg, isConfigured, rerenderSoon) {
  return () => {
    if (!sourceCfg.enabled && isConfigured(sourceCfg)) {
      sourceCfg.enabled = true;
      rerenderSoon();
    }
  };
}

function buildTagField(labelKey, values, placeholderKey, onChange) {
  return createField(
    t(labelKey),
    createTagInput(values, { placeholder: t(placeholderKey) }, onChange),
  );
}

function buildGoogleCredentialFields(gcalCfg, onFilled) {
  return [
    createField(
      t('settings.google_client_id'),
      createTextInput(
        gcalCfg.oauth.client_id || '',
        { placeholder: t('settings.google_client_id_placeholder') },
        (v) => {
          gcalCfg.oauth.client_id = v;
          onFilled();
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
          onFilled();
        },
      ),
    ),
  ];
}

function buildGoogleAuthorizeField(api) {
  return createField(
    t('settings.google_authorize'),
    createActionWithResult({
      label: t('settings.google_authorize_btn'),
      busyLabel: t('settings.google_authorize_wait'),
      run: async () => {
        // Authorization uses the saved credentials: save pending edits first.
        if (updateDirtyState() && !(await saveSettings())) {
          return null;
        }
        const outcome = googleAuthMessage(await api.authorizeGoogle(), t);
        refreshSourceStatus(api);
        return outcome;
      },
    }),
    t('settings.google_authorize_hint'),
  );
}

function buildGoogleAccountField(gcalCfg) {
  return createField(
    t('settings.google_account'),
    createTextInput(
      gcalCfg.google_account || '',
      { placeholder: t('settings.google_account_placeholder') },
      (v) => {
        gcalCfg.google_account = v;
      },
    ),
    t('settings.google_account_hint'),
  );
}

function buildGoogleExtraFields(gcalCfg) {
  return [
    buildTagField(
      'settings.calendars',
      gcalCfg.calendars,
      'settings.calendar_id_placeholder',
      (v) => {
        gcalCfg.calendars = v;
      },
    ),
    buildTagField(
      'settings.priority_keywords',
      gcalCfg.priority_keywords,
      'settings.keyword_placeholder',
      (v) => {
        gcalCfg.priority_keywords = v;
      },
    ),
    buildGoogleAccountField(gcalCfg),
  ];
}

function buildGoogleGroup(ctx, gcalCfg) {
  const { api, rerender, rerenderSoon } = ctx;
  const gcal = createFieldGroup(t('sidebar.google_calendar'));
  gcal.appendChild(buildEnabledField(gcalCfg, rerender));
  if (gcalCfg.enabled && !isGoogleConfigured(gcalCfg)) {
    gcal.appendChild(createNotice(t('settings.source_needs_setup'), 'warn'));
  }
  if (!isGoogleConfigured(gcalCfg)) {
    gcal.appendChild(createGoogleSteps(api));
  }
  const onFilled = createEnableWhenConfigured(gcalCfg, isGoogleConfigured, rerenderSoon);
  gcal.append(
    ...buildGoogleCredentialFields(gcalCfg, onFilled),
    buildGoogleAuthorizeField(api),
    createCollapsible(
      t('settings.more_options'),
      t('settings.google_more_options'),
      buildGoogleExtraFields(gcalCfg),
    ),
  );
  return gcal;
}

function buildOutlookUrlField(outlookCfg, rerenderSoon) {
  return createField(
    t('settings.outlook_ics_url'),
    createSecretInput(
      outlookCfg.ics_url || '',
      { placeholder: t('settings.outlook_ics_url_placeholder') },
      (v) => {
        outlookCfg.ics_url = v;
        if (v.trim() && !outlookCfg.enabled) {
          outlookCfg.enabled = true;
          rerenderSoon();
        }
      },
    ),
    t('settings.outlook_ics_url_hint'),
  );
}

function buildOutlookGroup(config, rerenderSoon) {
  if (!config.sources.outlook) {
    config.sources.outlook = { enabled: false, ics_url: '', priority_keywords: [] };
  }
  const outlookCfg = config.sources.outlook;
  const outlook = createFieldGroup(t('sidebar.outlook'));
  outlook.append(
    createField(
      t('common.enabled'),
      createToggle(outlookCfg.enabled, (v) => {
        outlookCfg.enabled = v;
      }),
    ),
    buildOutlookUrlField(outlookCfg, rerenderSoon),
    buildTagField(
      'settings.priority_keywords',
      outlookCfg.priority_keywords,
      'settings.keyword_placeholder',
      (v) => {
        outlookCfg.priority_keywords = v;
      },
    ),
  );
  return outlook;
}

function buildJqlField(jiraCfg, defaults, rerender) {
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
    rerender();
  });
  jqlWrap.append(jqlInput, jqlReset);
  return createField(t('settings.jql'), jqlWrap, t('settings.jql_hint'));
}

function buildInstanceHeader(instances, index, rerender) {
  const header = document.createElement('div');
  header.className = 'instance-header';
  const title = document.createElement('span');
  title.className = 'instance-title';
  title.textContent = t('settings.instance_n', { n: index + 1 });
  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn btn--danger';
  removeBtn.textContent = t('common.remove');
  removeBtn.addEventListener('click', () => {
    instances.splice(index, 1);
    rerender();
  });
  header.append(title, removeBtn);
  return header;
}

function buildInstanceFields(inst, onFilled) {
  return [
    createField(
      t('settings.jira_domain'),
      createTextInput(inst.domain, { placeholder: 'azienda.atlassian.net' }, (v) => {
        inst.domain = v;
        onFilled();
      }),
    ),
    createField(
      t('settings.jira_email'),
      createTextInput(inst.email, {}, (v) => {
        inst.email = v;
        onFilled();
      }),
    ),
    createField(
      t('settings.jira_api_token'),
      createSecretInput(inst.api_token, { placeholder: t('settings.api_key_placeholder') }, (v) => {
        inst.api_token = v;
        onFilled();
      }),
    ),
  ];
}

function buildJiraVerifyAction(api, jiraCfg, index) {
  return createActionWithResult({
    label: t('settings.jira_verify_btn'),
    busyLabel: t('settings.jira_verify_wait'),
    run: async () => {
      const inst = jiraCfg.instances[index];
      const result = await api.verifyJira(index, {
        domain: inst.domain,
        email: inst.email,
        api_token: inst.api_token,
        jql: jiraCfg.jql,
      });
      return jiraVerifyMessage(result, t);
    },
  });
}

function buildInstanceCard(ctx, jiraCfg, index, onFilled) {
  const card = document.createElement('div');
  card.className = 'instance-card';
  card.appendChild(buildInstanceHeader(jiraCfg.instances, index, ctx.rerender));
  card.append(...buildInstanceFields(jiraCfg.instances[index], onFilled));
  card.appendChild(buildJiraVerifyAction(ctx.api, jiraCfg, index));
  return card;
}

function renderJiraGroup(ctx) {
  const { defaults, rerender, rerenderSoon } = ctx;
  const jiraCfg = ctx.getConfig().sources.jira;
  if (!jiraCfg.instances) {
    jiraCfg.instances = [];
  }
  const jira = createFieldGroup(t('sidebar.jira'));
  jira.appendChild(buildEnabledField(jiraCfg, rerender));
  if (jiraCfg.enabled && !isJiraConfigured(jiraCfg)) {
    jira.appendChild(createNotice(t('settings.jira_needs_instance'), 'warn'));
  }
  jira.appendChild(buildJqlField(jiraCfg, defaults, rerender));
  const onFilled = createEnableWhenConfigured(jiraCfg, isJiraConfigured, rerenderSoon);
  jiraCfg.instances.forEach((_, i) =>
    jira.appendChild(buildInstanceCard(ctx, jiraCfg, i, onFilled)),
  );
  const addBtn = document.createElement('button');
  addBtn.className = 'btn btn--secondary btn--small';
  addBtn.textContent = t('settings.add_instance');
  addBtn.addEventListener('click', () => {
    jiraCfg.instances.push({ ...NEW_JIRA_INSTANCE });
    rerender();
  });
  jira.appendChild(addBtn);
  return jira;
}

// eslint-disable-next-line no-unused-vars -- called by settings.js through the renderers table
function renderSorgenti(ctx) {
  const config = ctx.getConfig();
  if (!config.sources.google_calendar.oauth) {
    config.sources.google_calendar.oauth = { client_id: '', client_secret: '' };
  }
  const gcal = buildGoogleGroup(ctx, config.sources.google_calendar);
  const outlook = buildOutlookGroup(config, ctx.rerenderSoon);
  const status = document.createElement('div');
  status.id = 'sourceStatusSlot';
  status.appendChild(createSourceStatusBox(ctx.api));
  return [status, gcal, outlook, renderJiraGroup(ctx)];
}

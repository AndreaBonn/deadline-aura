'use strict';

function toSaveIssues(zodIssues) {
  return zodIssues.map((issue) => ({
    path: issue.path.join('.'),
    code: issue.code,
    minimum: issue.minimum,
    maximum: issue.maximum,
    message: issue.message,
  }));
}

// Settings sends back the whole config it loaded when it opened. It does not edit these
// fields, while other windows change them meanwhile (the cat-menu snooze, the calendar the
// timer remembers): they come from the live config, or saving Settings would revert them.
function keepFieldsOwnedElsewhere(newConfig, live) {
  const next = { ...newConfig };
  if (live.meeting_flyby === undefined) {
    delete next.meeting_flyby;
  } else {
    next.meeting_flyby = live.meeting_flyby;
  }
  const liveCalendar = live.sources?.google_calendar?.default_log_calendar;
  if (next.sources?.google_calendar && liveCalendar !== undefined) {
    next.sources = {
      ...next.sources,
      google_calendar: { ...next.sources.google_calendar, default_log_calendar: liveCalendar },
    };
  }
  return next;
}

function saveSettings({ getConfig, restoreTokens, configSchema, applyConfig }) {
  return (submitted) => {
    const live = getConfig();
    const newConfig = keepFieldsOwnedElsewhere(submitted, live);
    restoreTokens(newConfig, live);
    const result = configSchema.safeParse(newConfig);
    if (!result.success) {
      return {
        ok: false,
        errors: result.error.flatten().fieldErrors,
        issues: toSaveIssues(result.error.issues),
      };
    }
    applyConfig(result.data);
    return { ok: true };
  };
}

function sourceStatus({
  getConfig,
  getLastSyncStatus,
  describeSourceStatus,
  collectSourceFacts,
  gcal,
  jira,
}) {
  return () => {
    const lastSyncStatus = getLastSyncStatus();
    return {
      at: lastSyncStatus ? lastSyncStatus.at : null,
      sources: describeSourceStatus(
        collectSourceFacts(getConfig(), { gcal, jira, lastSyncStatus }),
      ),
    };
  };
}

function verifyJira({ getConfig, maskConfigForRenderer, jira, defaults }) {
  return ({ instance }) => {
    const config = getConfig();
    const savedIndex = (config.sources.jira.instances || []).findIndex(
      (inst) => inst.domain === instance.domain && inst.email === instance.email,
    );
    const saved = config.sources.jira.instances?.[savedIndex];
    const maskedSaved = maskConfigForRenderer(config).sources.jira.instances?.[savedIndex];
    const apiToken = jira.pickVerifyToken(instance, saved, maskedSaved?.api_token);
    if (!apiToken) {
      return { ok: false, error: 'MISSING_FIELDS' };
    }
    return jira.verifyJiraInstance({
      domain: instance.domain,
      email: instance.email,
      apiToken,
      jql: instance.jql || config.sources.jira.jql || defaults.sources.jira.jql,
    });
  };
}

/**
 * Build the settings IPC handlers.
 * @param {object} deps - Config accessors, persistence, validation and source clients.
 * @returns {Object<string, Function>} Channel -> handler(payload).
 */
function createSettingsHandlers(deps) {
  return {
    'settings:get-config': () => deps.maskConfigForRenderer(deps.getConfig()),
    'settings:get-defaults': () => deps.defaults,
    'settings:save-config': saveSettings(deps),
    'settings:source-status': sourceStatus(deps),
    'jira:verify': verifyJira(deps),
  };
}

module.exports = { createSettingsHandlers, toSaveIssues };

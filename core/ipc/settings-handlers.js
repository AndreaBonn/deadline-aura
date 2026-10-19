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

function saveSettings({ getConfig, restoreTokens, configSchema, applyConfig }) {
  return (newConfig) => {
    restoreTokens(newConfig, getConfig());
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

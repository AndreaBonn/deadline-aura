'use strict';

// Placeholder shown to the renderer in place of stored secrets. The settings UI
// never receives the real values; on save, fields left untouched come back as
// this mask and are restored from the persisted config.
const TOKEN_MASK = '••••••••';

/**
 * Return a deep copy of the config with every stored secret replaced by the
 * mask, ready to hand to the renderer.
 *
 * @param {object} cfg - Application config.
 * @returns {object} Masked deep copy; the original is left untouched.
 */
function maskConfigForRenderer(cfg) {
  const masked = JSON.parse(JSON.stringify(cfg));

  const instances = masked.sources?.jira?.instances;
  if (Array.isArray(instances)) {
    for (const inst of instances) {
      if (inst.api_token) {
        inst.api_token = TOKEN_MASK;
      }
    }
  }

  const aiKeys = masked.ai?.api_keys;
  if (aiKeys) {
    for (const provider of Object.keys(aiKeys)) {
      if (aiKeys[provider]) {
        aiKeys[provider] = TOKEN_MASK;
      }
    }
  }

  const googleOauth = masked.sources?.google_calendar?.oauth;
  if (googleOauth && googleOauth.client_secret) {
    googleOauth.client_secret = TOKEN_MASK;
  }

  return masked;
}

/**
 * Replace masked secrets in a config coming back from the renderer with the
 * real values from the previously persisted config. Mutates newConfig in place.
 *
 * @param {object} newConfig - Config submitted by the renderer.
 * @param {object} originalConfig - Last persisted config holding the real secrets.
 */
function restoreTokens(newConfig, originalConfig) {
  const newInstances = newConfig.sources?.jira?.instances;
  const origInstances = originalConfig.sources?.jira?.instances;
  if (Array.isArray(newInstances) && Array.isArray(origInstances)) {
    for (let i = 0; i < newInstances.length; i++) {
      if (newInstances[i].api_token === TOKEN_MASK && origInstances[i]?.api_token) {
        newInstances[i].api_token = origInstances[i].api_token;
      }
    }
  }

  const newKeys = newConfig.ai?.api_keys;
  const origKeys = originalConfig.ai?.api_keys;
  if (newKeys && origKeys) {
    for (const provider of Object.keys(newKeys)) {
      if (newKeys[provider] === TOKEN_MASK && origKeys[provider]) {
        newKeys[provider] = origKeys[provider];
      }
    }
  }

  const newOauth = newConfig.sources?.google_calendar?.oauth;
  const origOauth = originalConfig.sources?.google_calendar?.oauth;
  if (newOauth && origOauth && newOauth.client_secret === TOKEN_MASK && origOauth.client_secret) {
    newOauth.client_secret = origOauth.client_secret;
  }
}

module.exports = { TOKEN_MASK, maskConfigForRenderer, restoreTokens };

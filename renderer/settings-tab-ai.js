'use strict';

/* global t, createField, createFieldGroup, createToggle, createNumberInput, createRangeWithValue,
   createSecretInput, createPriorityList, createNotice, createCollapsible, createProviderLabel,
   hasAnyAiKey, AI_PROVIDERS */
/* AI tab: provider keys and scoring. Rendered with the tab context of settings.js:
   { getConfig, defaults, api, rerender, rerenderSoon }. */

function buildAiOffBanner() {
  const banner = document.createElement('div');
  banner.appendChild(createNotice(t('settings.ai_off_banner'), 'warn'));
  return banner;
}

function buildApiKeyField(config, provider, api) {
  const field = document.createElement('div');
  field.className = 'field';
  field.append(
    createProviderLabel(provider, api),
    createSecretInput(
      config.ai.api_keys[provider.id] || '',
      { placeholder: t('settings.api_key_placeholder') },
      (v) => {
        config.ai.api_keys[provider.id] = v;
      },
    ),
  );
  return field;
}

function buildApiKeysGroup(config, api) {
  const keys = createFieldGroup(t('settings.ai_api_keys'));
  const intro = document.createElement('p');
  intro.className = 'settings-intro';
  intro.textContent = t('settings.ai_keys_intro');
  keys.appendChild(intro);
  for (const provider of AI_PROVIDERS) {
    keys.appendChild(buildApiKeyField(config, provider, api));
  }
  return keys;
}

function buildAiAdvanced(config) {
  return createCollapsible(t('settings.ai_advanced'), t('settings.ai_advanced_hint'), [
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
  ]);
}

function buildScoringGroup(config, rerender) {
  const group = createFieldGroup(t('settings.ai_scoring'));
  group.append(
    createField(
      t('common.enabled'),
      createToggle(config.ai.enabled, (v) => {
        config.ai.enabled = v;
        rerender();
      }),
    ),
    createField(
      t('settings.recalc_every'),
      createNumberInput(config.ai.recalc_hours, { min: 1, max: 24 }, (v) => {
        config.ai.recalc_hours = v;
      }),
      t('settings.hours'),
    ),
    buildAiAdvanced(config),
  );
  return group;
}

// eslint-disable-next-line no-unused-vars -- called by settings.js through the renderers table
function renderAI(ctx) {
  const { api, rerender } = ctx;
  const config = ctx.getConfig();
  if (!config.ai.api_keys) {
    config.ai.api_keys = { groq: '', gemini: '', openai: '', anthropic: '' };
  }
  const groups = [];
  if (config.ai.enabled && !hasAnyAiKey(config.ai.api_keys)) {
    groups.push(buildAiOffBanner());
  }
  groups.push(buildApiKeysGroup(config, api), buildScoringGroup(config, rerender));
  return groups;
}

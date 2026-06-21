'use strict';

const { GroqProvider } = require('./providers/groq');
const { GeminiProvider } = require('./providers/gemini');
const { OpenAIProvider } = require('./providers/openai');
const { AnthropicProvider } = require('./providers/anthropic');
const { buildScoringPrompt, parseAiResponse } = require('./prompt');

const PROVIDER_CLASSES = {
  groq: GroqProvider,
  gemini: GeminiProvider,
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
};

const ENV_KEY_MAP = {
  groq: 'GROQ_API_KEYS',
  gemini: 'GEMINI_API_KEYS',
  openai: 'OPENAI_API_KEYS',
  anthropic: 'ANTHROPIC_API_KEYS',
};

let cachedProviders = null;
let cachedCacheKey = null;

/**
 * Resolve the raw key string for a provider.
 *
 * Keys entered from the settings UI (config.ai.api_keys) take precedence over
 * the *_API_KEYS environment variables, which remain a fallback for development
 * and headless setups. The returned string may hold several comma-separated keys.
 *
 * @param {string} name - Provider name (groq, gemini, openai, anthropic).
 * @param {object} config - Application config.
 * @returns {string} Raw key string, empty when no key is configured.
 */
function resolveKeyString(name, config) {
  const fromConfig = config.ai?.api_keys?.[name];
  if (fromConfig && fromConfig.trim()) {
    return fromConfig;
  }
  return process.env[ENV_KEY_MAP[name]] || '';
}

function parseKeys(keysStr) {
  return keysStr
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

function buildCacheKey(priority, config) {
  const parts = priority.map((name) => `${name}:${resolveKeyString(name, config)}`);
  return priority.join(',') + '|' + parts.join('|');
}

function loadProviders(config) {
  const priority = config.ai?.provider_priority || ['groq', 'gemini', 'openai', 'anthropic'];
  const cacheKey = buildCacheKey(priority, config);

  if (cachedProviders && cachedCacheKey === cacheKey) {
    return cachedProviders;
  }

  const providers = [];

  for (const name of priority) {
    const keys = parseKeys(resolveKeyString(name, config));
    if (keys.length === 0) {
      continue;
    }

    const ProviderClass = PROVIDER_CLASSES[name];
    if (ProviderClass) {
      providers.push(new ProviderClass(keys));
    }
  }

  cachedProviders = providers;
  cachedCacheKey = cacheKey;
  return providers;
}

async function scoreEvents(events, config) {
  if (!events || events.length === 0) {
    return null;
  }

  const providers = loadProviders(config);

  if (providers.length === 0) {
    return null;
  }

  const prompt = buildScoringPrompt(events, config.language || 'it');
  const providerTimeout = config.ai?.provider_timeout_ms || 5000;
  const totalTimeout = config.ai?.total_timeout_ms || 15000;
  const temperature = config.ai?.temperature || 0.15;

  const deadline = Date.now() + totalTimeout;

  for (const provider of providers) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      console.error('[ai] total timeout exceeded, aborting failover');
      break;
    }

    const timeout = Math.min(providerTimeout, remaining);
    console.log(`[ai] trying ${provider.name} (timeout=${timeout}ms, remaining=${remaining}ms)`);

    try {
      const rawResponse = await provider.score(prompt, { timeout, temperature });
      const parsed = parseAiResponse(rawResponse);

      if (parsed && typeof parsed.global_stress === 'number') {
        console.log(`[ai] scored by ${provider.name}`);
        return parsed;
      }

      console.error(`${provider.name}: invalid response structure`);
    } catch (err) {
      console.error(`${provider.name}: ${err.message}`);
    }
  }

  return null;
}

module.exports = { scoreEvents, loadProviders, resolveKeyString };

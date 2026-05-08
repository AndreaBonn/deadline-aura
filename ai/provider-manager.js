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

function loadProviders(config) {
  const priority = config.ai?.provider_priority || ['groq', 'gemini', 'openai', 'anthropic'];
  const providers = [];

  for (const name of priority) {
    const envVar = ENV_KEY_MAP[name];
    const keysStr = process.env[envVar];

    if (!keysStr) {
      continue;
    }

    const keys = keysStr
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean);
    if (keys.length === 0) {
      continue;
    }

    const ProviderClass = PROVIDER_CLASSES[name];
    if (ProviderClass) {
      providers.push(new ProviderClass(keys));
    }
  }

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

  const prompt = buildScoringPrompt(events);
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

module.exports = { scoreEvents, loadProviders };

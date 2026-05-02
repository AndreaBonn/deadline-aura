'use strict';

const { BaseProvider } = require('./base-provider');

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-6';

class AnthropicProvider extends BaseProvider {
  constructor(apiKeys) {
    super('anthropic', apiKeys);
  }

  async score(prompt, options = {}) {
    const key = this.getNextKey();
    const { timeout = 10000, temperature = 0.15 } = options;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: 2000,
          temperature,
          messages: [{ role: 'user', content: prompt }],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Anthropic ${response.status}: ${text.slice(0, 200)}`);
      }

      const data = await response.json();
      return data.content[0].text;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { AnthropicProvider };

'use strict';

const { BaseProvider } = require('./base-provider');

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const DEFAULT_MODEL = 'gpt-4.1-nano';

class OpenAIProvider extends BaseProvider {
  constructor(apiKeys) {
    super('openai', apiKeys);
  }

  async score(prompt, options = {}) {
    const key = this.getNextKey();
    const { timeout = 10000, temperature = 0.15 } = options;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI ${response.status}: ${text.slice(0, 200)}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { OpenAIProvider };

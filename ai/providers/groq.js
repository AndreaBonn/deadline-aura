'use strict';

const { BaseProvider } = require('./base-provider');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'llama-3.1-70b-versatile';

class GroqProvider extends BaseProvider {
  constructor(apiKeys) {
    super('groq', apiKeys);
  }

  async score(prompt, options = {}) {
    const key = this.getNextKey();
    const { timeout = 10000, temperature = 0.15 } = options;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          messages: [{ role: 'user', content: prompt }],
          temperature,
          max_tokens: 2000,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Groq ${response.status}: ${text.slice(0, 200)}`);
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { GroqProvider };

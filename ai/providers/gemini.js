'use strict';

const { BaseProvider } = require('./base-provider');

const DEFAULT_MODEL = 'gemini-2.0-flash';

class GeminiProvider extends BaseProvider {
  constructor(apiKeys) {
    super('gemini', apiKeys);
  }

  getApiUrl(model, key) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
  }

  async score(prompt, options = {}) {
    const key = this.getNextKey();
    const { timeout = 10000, temperature = 0.15 } = options;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const url = this.getApiUrl(DEFAULT_MODEL, key);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature,
            maxOutputTokens: 2000,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Gemini ${response.status}: ${text.slice(0, 200)}`);
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text;
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { GeminiProvider };

'use strict';

const { loadProviders, scoreEvents } = require('../../ai/provider-manager');

describe('provider-manager — branch coverage', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('loadProviders', () => {
    it('skips provider when all keys are whitespace after trim', () => {
      process.env.GROQ_API_KEYS = '  ,  , ';

      const config = { ai: { provider_priority: ['groq'] } };
      const providers = loadProviders(config);

      expect(providers).toHaveLength(0);
    });

    it('uses default priority when ai.provider_priority is not set', () => {
      process.env.GROQ_API_KEYS = 'key1';

      const config = { ai: {} };
      const providers = loadProviders(config);

      expect(providers).toHaveLength(1);
      expect(providers[0].name).toBe('groq');
    });

    it('skips unknown provider names', () => {
      process.env.GROQ_API_KEYS = 'key1';

      const config = { ai: { provider_priority: ['unknown_provider', 'groq'] } };
      const providers = loadProviders(config);

      expect(providers).toHaveLength(1);
      expect(providers[0].name).toBe('groq');
    });
  });

  describe('scoreEvents — invalid response structure branch', () => {
    it('logs error and continues when parseAiResponse throws', async () => {
      process.env.GROQ_API_KEYS = 'key1';

      // Return invalid JSON that will make parseAiResponse throw
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'not valid json at all!!!' } }],
        }),
      });

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const consolLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      const config = {
        ai: {
          provider_priority: ['groq'],
          provider_timeout_ms: 5000,
          total_timeout_ms: 15000,
          temperature: 0.15,
        },
      };

      const result = await scoreEvents([{ id: '1', title: 'Test' }], config);

      expect(result).toBeNull();
      consoleSpy.mockRestore();
      consolLog.mockRestore();
    });

    it('uses default config values when ai config fields are missing', async () => {
      process.env.GROQ_API_KEYS = 'key1';

      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('timeout'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});

      // No provider_timeout_ms, total_timeout_ms, temperature, language
      const config = { ai: { provider_priority: ['groq'] } };
      const result = await scoreEvents([{ id: '1', title: 'Test' }], config);

      expect(result).toBeNull();
      vi.restoreAllMocks();
    });
  });
});

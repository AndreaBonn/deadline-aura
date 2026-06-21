const { TOKEN_MASK, maskConfigForRenderer, restoreTokens } = require('../../config/secret-masking');

describe('secret-masking', () => {
  describe('maskConfigForRenderer', () => {
    it('replaces non-empty AI keys with the mask', () => {
      const cfg = {
        ai: { api_keys: { groq: 'sk-groq', gemini: '', openai: 'sk-openai', anthropic: '' } },
      };

      const masked = maskConfigForRenderer(cfg);

      expect(masked.ai.api_keys.groq).toBe(TOKEN_MASK);
      expect(masked.ai.api_keys.openai).toBe(TOKEN_MASK);
      expect(masked.ai.api_keys.gemini).toBe('');
      expect(masked.ai.api_keys.anthropic).toBe('');
    });

    it('replaces non-empty Jira tokens with the mask', () => {
      const cfg = {
        sources: { jira: { instances: [{ api_token: 'secret' }, { api_token: '' }] } },
      };

      const masked = maskConfigForRenderer(cfg);

      expect(masked.sources.jira.instances[0].api_token).toBe(TOKEN_MASK);
      expect(masked.sources.jira.instances[1].api_token).toBe('');
    });

    it('does not mutate the original config', () => {
      const cfg = { ai: { api_keys: { groq: 'sk-groq' } } };

      maskConfigForRenderer(cfg);

      expect(cfg.ai.api_keys.groq).toBe('sk-groq');
    });

    it('tolerates a config without ai or jira sections', () => {
      expect(() => maskConfigForRenderer({})).not.toThrow();
    });
  });

  describe('restoreTokens', () => {
    it('restores masked AI keys from the original config', () => {
      const original = { ai: { api_keys: { groq: 'sk-real' } } };
      const incoming = { ai: { api_keys: { groq: TOKEN_MASK } } };

      restoreTokens(incoming, original);

      expect(incoming.ai.api_keys.groq).toBe('sk-real');
    });

    it('keeps a newly typed AI key instead of restoring the old one', () => {
      const original = { ai: { api_keys: { groq: 'sk-old' } } };
      const incoming = { ai: { api_keys: { groq: 'sk-new' } } };

      restoreTokens(incoming, original);

      expect(incoming.ai.api_keys.groq).toBe('sk-new');
    });

    it('restores masked Jira tokens by instance position', () => {
      const original = { sources: { jira: { instances: [{ api_token: 'real' }] } } };
      const incoming = { sources: { jira: { instances: [{ api_token: TOKEN_MASK }] } } };

      restoreTokens(incoming, original);

      expect(incoming.sources.jira.instances[0].api_token).toBe('real');
    });

    it('does not invent a value when the original key is absent', () => {
      const original = { ai: { api_keys: {} } };
      const incoming = { ai: { api_keys: { groq: TOKEN_MASK } } };

      restoreTokens(incoming, original);

      expect(incoming.ai.api_keys.groq).toBe(TOKEN_MASK);
    });
  });
});

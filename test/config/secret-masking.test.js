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

describe('secret-masking — google oauth', () => {
  it('masks a non-empty google oauth client_secret but not the client_id', () => {
    const cfg = {
      sources: {
        google_calendar: { oauth: { client_id: 'public-id', client_secret: 'shh' } },
      },
    };

    const masked = maskConfigForRenderer(cfg);

    expect(masked.sources.google_calendar.oauth.client_secret).toBe(TOKEN_MASK);
    expect(masked.sources.google_calendar.oauth.client_id).toBe('public-id');
  });

  it('leaves an empty client_secret untouched', () => {
    const cfg = {
      sources: { google_calendar: { oauth: { client_id: 'id', client_secret: '' } } },
    };

    expect(maskConfigForRenderer(cfg).sources.google_calendar.oauth.client_secret).toBe('');
  });

  it('restores a masked google client_secret from the original config', () => {
    const original = {
      sources: { google_calendar: { oauth: { client_secret: 'real-secret' } } },
    };
    const incoming = {
      sources: { google_calendar: { oauth: { client_secret: TOKEN_MASK } } },
    };

    restoreTokens(incoming, original);

    expect(incoming.sources.google_calendar.oauth.client_secret).toBe('real-secret');
  });

  it('keeps a newly typed google client_secret instead of restoring', () => {
    const original = {
      sources: { google_calendar: { oauth: { client_secret: 'old' } } },
    };
    const incoming = {
      sources: { google_calendar: { oauth: { client_secret: 'new' } } },
    };

    restoreTokens(incoming, original);

    expect(incoming.sources.google_calendar.oauth.client_secret).toBe('new');
  });
});

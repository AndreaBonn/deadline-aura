const { loadProviders } = require('../../ai/provider-manager');

// Keys are resolved from config.ai.api_keys first, falling back to the
// *_API_KEYS env vars. Each test uses distinct key strings so the internal
// provider cache (keyed on the resolved keys) never returns a stale result.
describe('provider-manager — keys from config', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('loads a provider from config when the env var is unset', () => {
    delete process.env.GROQ_API_KEYS;

    const config = { ai: { provider_priority: ['groq'], api_keys: { groq: 'cfg-groq-1' } } };
    const providers = loadProviders(config);

    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe('groq');
    expect(providers[0].apiKeys).toEqual(['cfg-groq-1']);
  });

  it('prefers the config key over the env var', () => {
    process.env.GROQ_API_KEYS = 'env-groq';

    const config = { ai: { provider_priority: ['groq'], api_keys: { groq: 'cfg-groq-2' } } };
    const providers = loadProviders(config);

    expect(providers[0].apiKeys).toEqual(['cfg-groq-2']);
  });

  it('falls back to the env var when the config key is an empty string', () => {
    process.env.OPENAI_API_KEYS = 'env-openai-1';

    const config = { ai: { provider_priority: ['openai'], api_keys: { openai: '   ' } } };
    const providers = loadProviders(config);

    expect(providers[0].apiKeys).toEqual(['env-openai-1']);
  });

  it('falls back to the env var when api_keys is absent', () => {
    process.env.OPENAI_API_KEYS = 'env-openai-2';

    const config = { ai: { provider_priority: ['openai'] } };
    const providers = loadProviders(config);

    expect(providers[0].apiKeys).toEqual(['env-openai-2']);
  });

  it('splits comma-separated keys coming from config', () => {
    delete process.env.ANTHROPIC_API_KEYS;

    const config = {
      ai: { provider_priority: ['anthropic'], api_keys: { anthropic: 'a1, a2 ,a3' } },
    };
    const providers = loadProviders(config);

    expect(providers[0].apiKeys).toEqual(['a1', 'a2', 'a3']);
  });
});

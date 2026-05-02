const { loadProviders } = require('../../ai/provider-manager');

describe('provider-manager', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns empty array when no API keys configured', () => {
    delete process.env.GROQ_API_KEYS;
    delete process.env.GEMINI_API_KEYS;
    delete process.env.OPENAI_API_KEYS;
    delete process.env.ANTHROPIC_API_KEYS;

    const config = { ai: { provider_priority: ['groq', 'openai'] } };
    const providers = loadProviders(config);

    expect(providers).toHaveLength(0);
  });

  it('loads providers in priority order', () => {
    process.env.GROQ_API_KEYS = 'key1';
    process.env.OPENAI_API_KEYS = 'key2';

    const config = { ai: { provider_priority: ['openai', 'groq'] } };
    const providers = loadProviders(config);

    expect(providers).toHaveLength(2);
    expect(providers[0].name).toBe('openai');
    expect(providers[1].name).toBe('groq');
  });

  it('skips providers without keys', () => {
    process.env.GROQ_API_KEYS = 'key1';
    delete process.env.OPENAI_API_KEYS;

    const config = { ai: { provider_priority: ['openai', 'groq'] } };
    const providers = loadProviders(config);

    expect(providers).toHaveLength(1);
    expect(providers[0].name).toBe('groq');
  });

  it('splits comma-separated keys', () => {
    process.env.GROQ_API_KEYS = 'key1,key2,key3';

    const config = { ai: { provider_priority: ['groq'] } };
    const providers = loadProviders(config);

    expect(providers[0].apiKeys).toHaveLength(3);
  });

  it('ignores empty key strings', () => {
    process.env.GROQ_API_KEYS = 'key1,,, ,key2';

    const config = { ai: { provider_priority: ['groq'] } };
    const providers = loadProviders(config);

    expect(providers[0].apiKeys).toHaveLength(2);
  });
});

const { scoreEvents } = require('../../ai/provider-manager');

describe('scoreEvents', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('returns null for empty events', async () => {
    const result = await scoreEvents([], {});
    expect(result).toBeNull();
  });

  it('returns null for null events', async () => {
    const result = await scoreEvents(null, {});
    expect(result).toBeNull();
  });

  it('returns null when no providers configured', async () => {
    delete process.env.GROQ_API_KEYS;
    delete process.env.GEMINI_API_KEYS;
    delete process.env.OPENAI_API_KEYS;
    delete process.env.ANTHROPIC_API_KEYS;

    const config = { ai: { provider_priority: ['groq'] } };
    const events = [{ id: '1', title: 'Test' }];
    const result = await scoreEvents(events, config);

    expect(result).toBeNull();
  });

  it('returns parsed result from first successful provider', async () => {
    process.env.GROQ_API_KEYS = 'test-key';

    const validResponse = JSON.stringify({
      global_stress: 6,
      per_event: [{ id: '1', stress: 6, category: 'work-routine', reasoning: 'ok' }],
    });

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: validResponse } }],
      }),
    });

    const config = {
      ai: { provider_priority: ['groq'], timeout_ms: 5000, temperature: 0.15 },
    };
    const events = [{ id: '1', title: 'Test' }];
    const result = await scoreEvents(events, config);

    expect(result.global_stress).toBe(6);
  });

  it('falls back to next provider on failure', async () => {
    process.env.GROQ_API_KEYS = 'key1';
    process.env.OPENAI_API_KEYS = 'key2';

    const validResponse = JSON.stringify({
      global_stress: 4,
      per_event: [],
    });

    vi.spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('Groq down'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: validResponse } }],
        }),
      });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const config = {
      ai: { provider_priority: ['groq', 'openai'], timeout_ms: 5000, temperature: 0.15 },
    };
    const result = await scoreEvents([{ id: '1', title: 'Test' }], config);

    expect(result.global_stress).toBe(4);
    consoleSpy.mockRestore();
  });

  it('returns null when all providers fail', async () => {
    process.env.GROQ_API_KEYS = 'key1';

    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('All down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const config = {
      ai: { provider_priority: ['groq'], timeout_ms: 5000, temperature: 0.15 },
    };
    const result = await scoreEvents([{ id: '1', title: 'Test' }], config);

    expect(result).toBeNull();
    vi.restoreAllMocks();
  });

  it('rejects response without global_stress', async () => {
    process.env.GROQ_API_KEYS = 'key1';

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"per_event": []}' } }],
      }),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const config = {
      ai: { provider_priority: ['groq'], timeout_ms: 5000, temperature: 0.15 },
    };
    const result = await scoreEvents([{ id: '1', title: 'Test' }], config);

    expect(result).toBeNull();
    vi.restoreAllMocks();
  });
});

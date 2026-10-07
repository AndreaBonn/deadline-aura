const { scoreTasks } = require('../../ai/ai-scorer');

describe('ai-scorer', () => {
  it('returns whatever providerManager.scoreEvents resolves with', async () => {
    const providerManager = require('../../ai/provider-manager');
    const fakeResult = { global_stress: 6.4, per_event: [] };
    const scoreSpy = vi.spyOn(providerManager, 'scoreEvents').mockResolvedValueOnce(fakeResult);
    const config = { ai: { enabled: true } };
    const tasks = [{ id: 'test_1', title: 'Test', source: 'gcal' }];

    try {
      const result = await scoreTasks(tasks, config);

      expect({ returnedSameResult: result === fakeResult, calls: scoreSpy.mock.calls }).toEqual({
        returnedSameResult: true,
        calls: [[tasks, config]],
      });
    } finally {
      scoreSpy.mockRestore();
    }
  });

  it('returns null when AI is disabled', async () => {
    const config = { ai: { enabled: false } };
    const result = await scoreTasks([{ id: 'test' }], config);
    expect(result).toBeNull();
  });

  it('returns null for empty task list', async () => {
    const config = { ai: { enabled: true } };
    const result = await scoreTasks([], config);
    expect(result).toBeNull();
  });

  it('returns null for null task list', async () => {
    const config = { ai: { enabled: true } };
    const result = await scoreTasks(null, config);
    expect(result).toBeNull();
  });

  it('returns null when no providers have keys', async () => {
    const originalEnv = { ...process.env };
    delete process.env.GROQ_API_KEYS;
    delete process.env.GEMINI_API_KEYS;
    delete process.env.OPENAI_API_KEYS;
    delete process.env.ANTHROPIC_API_KEYS;

    const config = {
      ai: {
        enabled: true,
        provider_priority: ['groq'],
        timeout_ms: 5000,
        temperature: 0.15,
      },
    };

    const tasks = [{ id: 'test_1', title: 'Test', source: 'gcal' }];
    const result = await scoreTasks(tasks, config);

    expect(result).toBeNull();

    process.env = { ...originalEnv };
  });
});

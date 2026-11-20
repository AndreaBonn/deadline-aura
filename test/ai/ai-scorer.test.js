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

  describe.each([
    ['AI is disabled', [{ id: 'test' }], { ai: { enabled: false } }],
    ['the ai section is missing', [{ id: 'test' }], {}],
    ['the task list is empty', [], { ai: { enabled: true } }],
    ['the task list is null', null, { ai: { enabled: true } }],
  ])('when %s', (_label, tasks, config) => {
    it('returns null without calling the provider manager', async () => {
      const providerManager = require('../../ai/provider-manager');
      const scoreSpy = vi.spyOn(providerManager, 'scoreEvents').mockResolvedValue({ marker: 1 });

      try {
        const result = await scoreTasks(tasks, config);

        expect({ result, calls: scoreSpy.mock.calls.length }).toEqual({ result: null, calls: 0 });
      } finally {
        scoreSpy.mockRestore();
      }
    });
  });

  it('calls the provider manager when AI is enabled and there are tasks (pairs the skip cases)', async () => {
    const providerManager = require('../../ai/provider-manager');
    const scoreSpy = vi.spyOn(providerManager, 'scoreEvents').mockResolvedValue({ marker: 1 });
    const config = { ai: { enabled: true } };
    const tasks = [{ id: 'one' }];

    try {
      const result = await scoreTasks(tasks, config);

      expect({ result, calls: scoreSpy.mock.calls }).toEqual({
        result: { marker: 1 },
        calls: [[tasks, config]],
      });
    } finally {
      scoreSpy.mockRestore();
    }
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

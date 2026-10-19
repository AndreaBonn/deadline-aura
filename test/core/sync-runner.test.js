'use strict';

const { runSyncCycle } = require('../../core/sync-runner');

const NOW = 1_700_000_000_000;

function makeDeps(overrides = {}) {
  return {
    tag: 'sync-now',
    failureLabel: 'Manual sync error:',
    sync: vi.fn().mockResolvedValue({ errors: [] }),
    summarize: vi.fn((result, now) => ({
      at: now,
      failedSources: (result.errors || []).map((e) => e.source),
    })),
    onStatus: vi.fn(),
    refresh: vi.fn(),
    log: { error: vi.fn() },
    now: () => NOW,
    ...overrides,
  };
}

describe('runSyncCycle', () => {
  it('publishes the summary then refreshes without arguments when force is off', async () => {
    const deps = makeDeps({ sync: vi.fn().mockResolvedValue({ errors: [{ source: 'jira' }] }) });
    await runSyncCycle(deps);
    expect(deps.onStatus).toHaveBeenCalledWith({ at: NOW, failedSources: ['jira'] });
    expect(deps.refresh).toHaveBeenCalledTimes(1);
    expect(deps.refresh).toHaveBeenCalledWith();
  });

  it('refreshes with { force: true } when force is on', async () => {
    const deps = makeDeps({ force: true });
    await runSyncCycle(deps);
    expect(deps.refresh).toHaveBeenCalledWith({ force: true });
  });

  it('logs the errors array under the tag when there are errors', async () => {
    const errors = [{ source: 'gcal', message: 'boom' }];
    const deps = makeDeps({ sync: vi.fn().mockResolvedValue({ errors }) });
    await runSyncCycle(deps);
    expect(deps.log.error).toHaveBeenCalledWith('[sync-now] errors:', JSON.stringify(errors));
  });

  it.each([[{ errors: [] }], [{}], [{ errors: null }]])(
    'does not log when errors is empty or absent: %j',
    async (result) => {
      const deps = makeDeps({ sync: vi.fn().mockResolvedValue(result) });
      await runSyncCycle(deps);
      expect(deps.log.error).not.toHaveBeenCalled();
      expect(deps.refresh).toHaveBeenCalledTimes(1);
    },
  );

  it('logs and swallows a sync exception without touching status or refresh', async () => {
    const deps = makeDeps({ sync: vi.fn().mockRejectedValue(new Error('network down')) });
    await expect(runSyncCycle(deps)).resolves.toBeUndefined();
    expect(deps.log.error).toHaveBeenCalledWith('Manual sync error:', 'network down');
    expect(deps.onStatus).not.toHaveBeenCalled();
    expect(deps.refresh).not.toHaveBeenCalled();
  });

  it('swallows a synchronous throw from the sync function', async () => {
    const deps = makeDeps({
      sync: vi.fn(() => {
        throw new Error('require failed');
      }),
    });
    await runSyncCycle(deps);
    expect(deps.log.error).toHaveBeenCalledWith('Manual sync error:', 'require failed');
  });

  it('swallows an exception from refresh after publishing status', async () => {
    const deps = makeDeps({
      refresh: vi.fn(() => {
        throw new Error('refresh broke');
      }),
    });
    await runSyncCycle(deps);
    expect(deps.onStatus).toHaveBeenCalledTimes(1);
    expect(deps.log.error).toHaveBeenCalledWith('Manual sync error:', 'refresh broke');
  });

  it('defaults now to Date.now', async () => {
    const deps = makeDeps({ now: undefined });
    const before = Date.now();
    await runSyncCycle(deps);
    const { at } = deps.onStatus.mock.calls[0][0];
    expect(at).toBeGreaterThanOrEqual(before);
    expect(at).toBeLessThanOrEqual(Date.now());
  });
});

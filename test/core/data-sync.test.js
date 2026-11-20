const { createDataSync } = require('../../core/data-sync');

const MINUTE_MS = 60000;

function setup({ minutes = 10 } = {}) {
  const state = { config: { sync: { data_interval_minutes: minutes } } };
  const timers = [];
  const clearedAll = [];
  const syncDaemon = { sync: vi.fn(async () => ({ gcal: 1, jira: 2, errors: [] })) };
  const runSyncCycle = vi.fn(async ({ sync }) => sync());
  const refresh = vi.fn();
  const log = { log: vi.fn(), error: vi.fn() };
  const dataSync = createDataSync({
    getConfig: () => state.config,
    getSyncDaemon: () => syncDaemon,
    runSyncCycle,
    summarize: (result) => ({ summary: result }),
    refresh,
    log,
    setIntervalFn: (fn, ms) => {
      const timer = { fn, ms };
      timers.push(timer);
      return timer;
    },
    clearIntervalFn: (timer) => clearedAll.push(timer),
  });
  const cleared = {
    get list() {
      return clearedAll.filter(Boolean);
    },
  };
  return { state, timers, cleared, syncDaemon, runSyncCycle, refresh, log, dataSync };
}

describe('scheduleDataSync', () => {
  it('starts an interval from the configured minutes', () => {
    const { dataSync, timers } = setup({ minutes: 5 });
    dataSync.scheduleDataSync();
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBe(5 * MINUTE_MS);
  });

  it('falls back to 10 minutes when the config has no interval', () => {
    const { dataSync, timers } = setup({ minutes: 0 });
    dataSync.scheduleDataSync();
    expect(timers[0].ms).toBe(10 * MINUTE_MS);
  });

  it('keeps the running timer when the interval did not change', () => {
    const { dataSync, timers, cleared } = setup();
    dataSync.scheduleDataSync();
    dataSync.scheduleDataSync();
    expect(timers).toHaveLength(1);
    expect(cleared.list).toEqual([]);
  });

  it('replaces the timer when the interval changed', () => {
    const { dataSync, timers, cleared, state } = setup({ minutes: 10 });
    dataSync.scheduleDataSync();
    state.config = { sync: { data_interval_minutes: 3 } };
    dataSync.scheduleDataSync();
    expect(cleared.list).toEqual([timers[0]]);
    expect(timers).toHaveLength(2);
    expect(timers[1].ms).toBe(3 * MINUTE_MS);
  });

  it('each tick runs a forced data-sync cycle against the live config', async () => {
    const { dataSync, timers, runSyncCycle, syncDaemon, state } = setup();
    dataSync.scheduleDataSync();
    state.config = { ...state.config, marker: 'later' };
    await timers[0].fn();
    expect(runSyncCycle.mock.calls[0][0]).toMatchObject({
      tag: 'data-sync',
      failureLabel: '[data-sync] error:',
      force: true,
    });
    expect(syncDaemon.sync).toHaveBeenCalledWith(state.config);
  });
});

describe('runManualSync and status', () => {
  it('runs a non-forced sync-now cycle with the live config', async () => {
    const { dataSync, runSyncCycle, syncDaemon, state } = setup();
    await dataSync.runManualSync();
    const options = runSyncCycle.mock.calls[0][0];
    expect(options).toMatchObject({ tag: 'sync-now', failureLabel: 'Manual sync error:' });
    expect(options.force).toBeUndefined();
    expect(syncDaemon.sync).toHaveBeenCalledWith(state.config);
  });

  it('exposes the last summary published by a cycle, null before any', async () => {
    const { dataSync, runSyncCycle } = setup();
    expect(dataSync.getLastStatus()).toBeNull();
    runSyncCycle.mockImplementation(async ({ onStatus }) => onStatus({ at: 123 }));
    await dataSync.runManualSync();
    expect(dataSync.getLastStatus()).toEqual({ at: 123 });
  });

  it('wires summarize, refresh and the logger into every cycle', async () => {
    const { dataSync, runSyncCycle, refresh, log } = setup();
    await dataSync.runManualSync();
    const options = runSyncCycle.mock.calls[0][0];
    expect(options.summarize({ x: 1 })).toEqual({ summary: { x: 1 } });
    options.refresh({ force: true });
    expect(refresh).toHaveBeenCalledWith({ force: true });
    expect(options.log).toBe(log);
  });
});

describe('startupSync', () => {
  it('runs a forced startup-sync and logs the per-source counts', async () => {
    const { dataSync, runSyncCycle, log } = setup();
    await dataSync.startupSync();
    expect(runSyncCycle.mock.calls[0][0]).toMatchObject({
      tag: 'startup-sync',
      failureLabel: '[startup-sync] failed:',
      force: true,
    });
    expect(log.log).toHaveBeenCalledWith('[startup-sync] complete: gcal=1, jira=2');
  });

  it('does not log completion when the sync fails', async () => {
    const { dataSync, syncDaemon, log } = setup();
    syncDaemon.sync.mockRejectedValue(new Error('offline'));
    await expect(dataSync.startupSync()).rejects.toThrow('offline');
    expect(log.log).not.toHaveBeenCalled();
  });
});

describe('stop', () => {
  it('clears the running timer', () => {
    const { dataSync, timers, cleared } = setup();
    dataSync.scheduleDataSync();
    dataSync.stop();
    expect(cleared.list).toEqual([timers[0]]);
  });
});

describe('one sync at a time', () => {
  function holdSync(syncDaemon) {
    const finishes = [];
    syncDaemon.sync.mockImplementation(
      () =>
        new Promise((resolve) => finishes.push(() => resolve({ gcal: 0, jira: 0, errors: [] }))),
    );
    return finishes;
  }

  it('a periodic tick while a sync runs is skipped, and the next one syncs again', async () => {
    const { dataSync, syncDaemon, timers } = setup();
    const finishes = holdSync(syncDaemon);
    dataSync.scheduleDataSync();

    const manual = dataSync.runManualSync();
    timers[0].fn();
    expect(syncDaemon.sync).toHaveBeenCalledTimes(1);
    finishes[0]();
    await manual;

    timers[0].fn();
    expect(syncDaemon.sync).toHaveBeenCalledTimes(2);
  });

  it('a failed sync does not block the next one', async () => {
    const { dataSync, syncDaemon } = setup();
    syncDaemon.sync.mockRejectedValueOnce(new Error('offline'));
    await expect(dataSync.runManualSync()).rejects.toThrow('offline');
    await dataSync.runManualSync();
    expect(syncDaemon.sync).toHaveBeenCalledTimes(2);
  });
});

describe('stop then schedule', () => {
  it('a schedule after stop arms a new timer even with the same interval', () => {
    const { dataSync, timers } = setup();
    dataSync.scheduleDataSync();
    dataSync.stop();
    dataSync.scheduleDataSync();
    expect(timers).toHaveLength(2);
  });
});

describe('single flight edge cases', () => {
  it('a manual sync asked during a running cycle runs once more after it ends', async () => {
    const { dataSync, syncDaemon } = setup();
    const finishes = [];
    syncDaemon.sync.mockImplementation(
      () =>
        new Promise((resolve) => finishes.push(() => resolve({ gcal: 0, jira: 0, errors: [] }))),
    );
    const startup = dataSync.startupSync();
    const first = dataSync.runManualSync();
    const second = dataSync.runManualSync();
    finishes[0]();
    await startup;
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }
    expect(syncDaemon.sync).toHaveBeenCalledTimes(2);
    finishes[1]();
    await Promise.all([first, second]);
    expect(syncDaemon.sync).toHaveBeenCalledTimes(2);
  });

  it('a cycle hung past the stale limit no longer blocks new syncs', async () => {
    vi.useFakeTimers();
    try {
      const { dataSync, syncDaemon } = setup();
      syncDaemon.sync.mockImplementationOnce(() => new Promise(() => {}));
      dataSync.startupSync();
      vi.advanceTimersByTime(15 * MINUTE_MS);
      await dataSync.runManualSync();
      expect(syncDaemon.sync).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('hung cycles', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('a slow cycle that ends after a newer one started does not release the newer one', async () => {
    const { dataSync, syncDaemon } = setup();
    let finishSlow;
    syncDaemon.sync.mockImplementationOnce(
      () => new Promise((resolve) => (finishSlow = () => resolve({ errors: [] }))),
    );
    dataSync.startupSync();
    vi.advanceTimersByTime(15 * MINUTE_MS);
    syncDaemon.sync.mockImplementationOnce(() => new Promise(() => {}));
    dataSync.runSyncAndRefresh({ sync: () => syncDaemon.sync() });

    finishSlow();
    await vi.advanceTimersByTimeAsync(0);
    dataSync.runSyncAndRefresh({ sync: () => syncDaemon.sync() });

    expect(syncDaemon.sync).toHaveBeenCalledTimes(2);
  });

  it('a manual sync asked during a hung cycle runs when the cycle turns stale', async () => {
    const { dataSync, syncDaemon } = setup();
    syncDaemon.sync.mockImplementationOnce(() => new Promise(() => {}));
    dataSync.startupSync();

    const manual = dataSync.runManualSync();
    await vi.advanceTimersByTimeAsync(10 * MINUTE_MS);
    await manual;

    expect(syncDaemon.sync).toHaveBeenCalledTimes(2);
  });
});

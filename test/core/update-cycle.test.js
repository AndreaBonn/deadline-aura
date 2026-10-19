const { createUpdateCycle } = require('../../core/update-cycle');

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function setup({ wallpaper = { enabled: true, show_ai_usage: true }, overrides = {} } = {}) {
  const order = [];
  const sidebarSends = [];
  const world = { config: { wallpaper }, syncStatus: null, hint: false, ready: true };
  const engineResult = { global_score: 4 };
  const palette = { accent_hex: '#abc' };
  const deps = {
    getConfig: () => world.config,
    runEngine: vi.fn(() => engineResult),
    mapScoreToColor: vi.fn(() => palette),
    wallpaperChanger: {
      update: vi.fn(async () => {
        order.push('wallpaper');
      }),
    },
    db: {
      getUpcomingCalendarEvents: vi.fn(() => ['event']),
      getLatestAiCacheResponse: vi.fn(() => ({ note: 'N' })),
    },
    pinnedQueries: { getAllPinned: () => [{ task_id: 'p1' }, { task_id: 'p1' }] },
    favoriteQueries: { getAllFavoriteIds: () => ['f1'] },
    collectUsage: vi.fn(() => ['usage-row']),
    getLanguage: () => 'it',
    isGoogleCalendarReady: vi.fn(() => true),
    screen: { id: 'screen' },
    strips: { updateStripColor: (hex) => order.push(['strip', hex]) },
    meetingDocks: { updateMeetingDocks: () => order.push('docks') },
    sidebar: {
      sendWhenReady: (channel, build) => {
        order.push('sidebar');
        if (world.ready) {
          sidebarSends.push([channel, build()]);
        }
      },
    },
    getSyncStatus: () => world.syncStatus,
    isFirstRunHintPending: () => world.hint,
    now: () => 1000,
    log: { warn: vi.fn(), error: vi.fn() },
    ...overrides,
  };
  return { deps, order, sidebarSends, world, engineResult, palette, run: createUpdateCycle(deps) };
}

describe('update cycle: full run', () => {
  it('updates wallpaper, strips, docks and the sidebar in that order and returns the result', async () => {
    const { run, order, engineResult, palette } = setup();
    await expect(run()).resolves.toEqual({ engineResult, palette });
    expect(order).toEqual(['wallpaper', ['strip', '#abc'], 'docks', 'sidebar']);
  });

  it('passes the engine result, force flag, screen, events and usage to the wallpaper', async () => {
    const { run, deps, engineResult, palette } = setup();
    await run({ force: true });
    expect(deps.db.getUpcomingCalendarEvents).toHaveBeenCalledWith(ONE_DAY_MS);
    expect(deps.collectUsage).toHaveBeenCalledWith({ nowMs: 1000, lang: 'it' });
    expect(deps.wallpaperChanger.update).toHaveBeenCalledWith(palette, {
      engineResult,
      force: true,
      electronScreen: deps.screen,
      calendarEvents: ['event'],
      usageRows: ['usage-row'],
    });
  });

  it('defaults force to false', async () => {
    const { run, deps } = setup();
    await run();
    expect(deps.wallpaperChanger.update.mock.calls[0][1].force).toBe(false);
  });

  it('builds the sidebar payload lazily from the state at send time', async () => {
    const { run, sidebarSends, world } = setup();
    world.syncStatus = { at: 9 };
    world.hint = true;
    await run();
    expect(sidebarSends).toHaveLength(1);
    const [channel, payload] = sidebarSends[0];
    expect(channel).toBe('update');
    expect(payload).toMatchObject({
      pinnedTaskIds: ['p1'],
      favoriteTaskIds: ['f1'],
      clinicalNote: 'N',
      syncStatus: { at: 9 },
      googleCalendarReady: true,
      showFirstRunHint: true,
    });
  });

  it('asks Google readiness with the live config, only when the payload is built', async () => {
    const { run, deps, world } = setup();
    world.ready = false;
    await run();
    expect(deps.isGoogleCalendarReady).not.toHaveBeenCalled();
    world.ready = true;
    await run();
    expect(deps.isGoogleCalendarReady).toHaveBeenCalledWith(world.config);
  });
});

describe('update cycle: wallpaper branch', () => {
  it('skips events, usage and wallpaper when the wallpaper is disabled', async () => {
    const { run, deps, order } = setup({ wallpaper: { enabled: false, show_ai_usage: true } });
    await run();
    expect(deps.db.getUpcomingCalendarEvents).not.toHaveBeenCalled();
    expect(deps.collectUsage).not.toHaveBeenCalled();
    expect(deps.wallpaperChanger.update).not.toHaveBeenCalled();
    expect(order).toEqual([['strip', '#abc'], 'docks', 'sidebar']);
  });

  it('skips usage collection when show_ai_usage is off', async () => {
    const { run, deps } = setup({ wallpaper: { enabled: true, show_ai_usage: false } });
    await run();
    expect(deps.collectUsage).not.toHaveBeenCalled();
    expect(deps.wallpaperChanger.update.mock.calls[0][1].usageRows).toEqual([]);
  });

  it('warns and continues with no usage rows when collection throws', async () => {
    const { run, deps } = setup({
      overrides: {
        collectUsage: () => {
          throw new Error('no usage');
        },
      },
    });
    await run();
    expect(deps.log.warn).toHaveBeenCalledWith(
      'runUpdateCycle: failed to collect AI usage:',
      'no usage',
    );
    expect(deps.wallpaperChanger.update.mock.calls[0][1].usageRows).toEqual([]);
  });
});

describe('update cycle: re-entrancy and errors', () => {
  it('ignores a call made while a cycle is running', async () => {
    let release;
    const { run, deps } = setup({
      overrides: {
        wallpaperChanger: { update: () => new Promise((resolve) => (release = resolve)) },
      },
    });
    const first = run();
    await expect(run()).resolves.toBeUndefined();
    expect(deps.runEngine).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it('allows a new cycle once the previous one finished', async () => {
    const { run, deps } = setup();
    await run();
    await run();
    expect(deps.runEngine).toHaveBeenCalledTimes(2);
  });

  it('logs the error, returns null and frees the guard when a step throws', async () => {
    const { run, deps } = setup({
      overrides: {
        runEngine: vi
          .fn()
          .mockImplementationOnce(() => {
            throw new Error('engine');
          })
          .mockReturnValue({ global_score: 1 }),
      },
    });
    await expect(run()).resolves.toBeNull();
    expect(deps.log.error).toHaveBeenCalledWith('Update cycle error:', 'engine');
    await expect(run()).resolves.not.toBeNull();
  });

  it('survives a logger that throws (closed pipe) and still returns null', async () => {
    const { run } = setup({
      overrides: {
        runEngine: () => {
          throw new Error('engine');
        },
        log: {
          warn: vi.fn(),
          error: () => {
            throw new Error('EPIPE');
          },
        },
      },
    });
    await expect(run()).resolves.toBeNull();
  });
});

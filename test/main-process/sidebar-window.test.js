const { createSidebarWindow } = require('../../main-process/sidebar-window');
const { createFakeElectron } = require('./fakes');

const SIDEBAR_WIDTH = 300;

function setup({ hintPending = false } = {}) {
  const electron = createFakeElectron();
  const stripCalls = [];
  const world = { occupied: new Set(), occupiedUnknown: false, hintPending, width: SIDEBAR_WIDTH };
  const refresh = vi.fn();
  const onFirstRunShown = vi.fn();
  const sidebar = createSidebarWindow({
    BrowserWindow: electron.BrowserWindow,
    screen: electron.screen,
    strips: {
      hideStrip: (id) => stripCalls.push(['hide', id]),
      showStrip: (id) => stripCalls.push(['show', id]),
    },
    getConfig: () => ({ sidebar: { width: world.width } }),
    getDisplaysWithWindows: (_screen, callback) =>
      callback(world.occupiedUnknown ? null : world.occupied),
    refresh,
    isFirstRunHintPending: () => world.hintPending,
    onFirstRunShown,
  });
  return { electron, sidebar, stripCalls, world, refresh, onFirstRunShown };
}

/** A created sidebar whose page has finished loading. */
function setupReady(options) {
  const ctx = setup(options);
  ctx.sidebar.create();
  ctx.window = ctx.electron.windows[0];
  ctx.window.finishLoad();
  return ctx;
}

describe('SidebarWindow lifecycle and messaging', () => {
  it('send and sendWhenReady are no-ops before the window exists', () => {
    const { sidebar, electron } = setup();
    const build = vi.fn();
    sidebar.send('config-changed', {});
    sidebar.sendWhenReady('update', build);
    sidebar.toggle();
    expect(electron.windows).toHaveLength(0);
    expect(build).not.toHaveBeenCalled();
  });

  it('create twice yields a single window', () => {
    const { sidebar, electron } = setup();
    sidebar.create();
    sidebar.create();
    expect(electron.windows).toHaveLength(1);
    expect(electron.windows[0].loadedFile).toMatch(/renderer[/\\]index\.html$/);
  });

  it('sendWhenReady drops the message and skips the builder until did-finish-load', () => {
    const { sidebar, electron } = setup();
    const build = vi.fn(() => ({ n: 1 }));
    sidebar.create();
    const window = electron.windows[0];
    sidebar.sendWhenReady('update', build);
    expect(window.sent).toEqual([]);
    expect(build).not.toHaveBeenCalled();
    window.finishLoad();
    sidebar.sendWhenReady('update', build);
    expect(window.sent).toEqual([['update', { n: 1 }]]);
  });

  it('send reaches the window even before the page has loaded', () => {
    const { sidebar, electron } = setup();
    sidebar.create();
    sidebar.send('config-changed', { language: 'en' });
    expect(electron.windows[0].sent).toEqual([['config-changed', { language: 'en' }]]);
  });

  it('send and sendWhenReady drop messages after the window is destroyed', () => {
    const { sidebar, window } = setupReady();
    window.destroyed = true;
    sidebar.send('config-changed', {});
    sidebar.sendWhenReady('update', () => ({}));
    expect(window.sent).toEqual([]);
  });

  it('after "closed" the sidebar is gone until create() builds a fresh window', () => {
    const { sidebar, electron, window } = setupReady();
    window.close();
    sidebar.send('config-changed', {});
    expect(window.sent).toEqual([]);
    sidebar.create();
    expect(electron.windows).toHaveLength(2);
    sidebar.sendWhenReady('update', () => ({}));
    expect(electron.windows[1].sent).toEqual([]); // new page not loaded yet
  });

  it('did-finish-load triggers a forced refresh', () => {
    const { refresh } = setupReady();
    expect(refresh).toHaveBeenCalledWith({ force: true });
  });
});

describe('SidebarWindow first-run hint', () => {
  it('shows once on the primary display and reports it when the hint is pending', () => {
    const { window, onFirstRunShown, stripCalls, electron } = setupReady({ hintPending: true });
    expect(window.visible).toBe(true);
    expect(window.bounds.x).toBe(electron.primary.workArea.width - SIDEBAR_WIDTH);
    expect(stripCalls).toEqual([['hide', '1']]);
    expect(onFirstRunShown).toHaveBeenCalledTimes(1);
  });

  it('stays hidden and silent when no hint is pending', () => {
    const { window, onFirstRunShown } = setupReady();
    expect(window.visible).toBe(false);
    expect(onFirstRunShown).not.toHaveBeenCalled();
  });
});

describe('SidebarWindow toggle', () => {
  it('opens on the display under the cursor, hiding that display strip, then closes and restores it', () => {
    const { sidebar, window, stripCalls, electron } = setupReady();
    sidebar.toggle();
    expect(window.visible).toBe(true);
    expect(window.bounds.x).toBe(
      electron.secondary.workArea.x + electron.secondary.workAreaSize.width - SIDEBAR_WIDTH,
    );
    expect(stripCalls).toEqual([['hide', '2']]);
    sidebar.toggle();
    expect(window.visible).toBe(false);
    expect(stripCalls).toEqual([
      ['hide', '2'],
      ['show', '2'],
    ]);
  });

  it('reads the sidebar width from the live config on every open', () => {
    const { sidebar, window, world } = setupReady();
    sidebar.toggle();
    expect(window.bounds.width).toBe(SIDEBAR_WIDTH);
    sidebar.toggle();
    world.width = 420;
    sidebar.toggle();
    expect(window.bounds.width).toBe(420);
  });
});

describe('SidebarWindow checkDesktopState', () => {
  it('does nothing before the page has loaded', () => {
    const { sidebar, electron, world } = setup();
    sidebar.create();
    world.occupied = new Set(['1']);
    sidebar.checkDesktopState();
    expect(electron.windows[0].visible).toBe(false);
  });

  it('does nothing with a single display', () => {
    const { sidebar, window, electron, world } = setupReady();
    electron.state.displays = [electron.primary];
    world.occupied = new Set();
    sidebar.checkDesktopState();
    expect(window.visible).toBe(false);
  });

  it('does nothing when the occupied set is unknown', () => {
    const { sidebar, window, world } = setupReady();
    world.occupiedUnknown = true;
    sidebar.checkDesktopState();
    expect(window.visible).toBe(false);
  });

  it('auto-shows on the free display and auto-hides when none is free', () => {
    const { sidebar, window, world, stripCalls } = setupReady();
    world.occupied = new Set(['1']);
    sidebar.checkDesktopState();
    expect(window.visible).toBe(true);
    expect(stripCalls).toEqual([['hide', '2']]);
    world.occupied = new Set(['1', '2']);
    sidebar.checkDesktopState();
    expect(window.visible).toBe(false);
    expect(stripCalls).toEqual([
      ['hide', '2'],
      ['show', '2'],
    ]);
  });

  it('a manual close blocks auto-show until every display is occupied once', () => {
    const { sidebar, window, world } = setupReady();
    world.occupied = new Set(['1']);
    sidebar.toggle(); // open manually
    sidebar.toggle(); // close manually
    sidebar.checkDesktopState();
    expect(window.visible).toBe(false); // free display, but manual close wins
    world.occupied = new Set(['1', '2']);
    sidebar.checkDesktopState(); // no free display: manual close is forgotten
    world.occupied = new Set(['1']);
    sidebar.checkDesktopState();
    expect(window.visible).toBe(true);
  });

  it('a manual open survives the "no free display" auto-hide', () => {
    const { sidebar, window, world } = setupReady();
    sidebar.toggle(); // manual open
    world.occupied = new Set(['1', '2']);
    sidebar.checkDesktopState();
    expect(window.visible).toBe(true);
  });
});

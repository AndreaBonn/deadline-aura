const { createOverlayWindow } = require('../../main-process/overlay-window');
const { createFakeElectron } = require('./fakes');

function setup() {
  const electron = createFakeElectron();
  const overlayStates = [];
  const pinned = { 2: [{ id: 'a' }] };
  const handlers = {};
  const pinnedQueries = {
    getByDisplay: (displayId) => pinned[displayId] || [],
    pinTask: vi.fn(),
    unpinTask: vi.fn(),
    unpinTaskFromAll: vi.fn(),
    updatePositions: vi.fn(),
  };
  const refresh = vi.fn();
  const overlay = createOverlayWindow({
    BrowserWindow: electron.BrowserWindow,
    screen: electron.screen,
    wallpaperChanger: { setOverlayOpen: (open) => overlayStates.push(open) },
    pinnedQueries,
    withPostitCodes: (tasks) => tasks.map((t) => ({ ...t, code: 'P1' })),
    refresh,
  });
  overlay.registerIpc({ on: (channel, handler) => (handlers[channel] = handler) });
  const fire = (channel, payload) => handlers[channel]({}, payload);
  return { electron, overlay, overlayStates, pinnedQueries, refresh, fire, handlers };
}

describe('OverlayWindow open and close', () => {
  it('open marks the overlay open, sizes it to the target display and sends init once loaded', () => {
    const { overlay, electron, overlayStates } = setup();
    overlay.open('2');
    const window = electron.windows[0];
    expect(overlayStates).toEqual([true]);
    expect(window.sent).toEqual([]);
    window.finishLoad();
    expect(window.sent).toEqual([
      [
        'overlay-init',
        {
          pinnedTasks: [{ id: 'a', code: 'P1' }],
          displayId: '2',
          width: electron.secondary.size.width,
          height: electron.secondary.size.height,
        },
      ],
    ]);
  });

  it('open twice focuses the existing window and does not re-flag the overlay as open', () => {
    const { overlay, electron, overlayStates } = setup();
    overlay.open('2');
    overlay.open('2');
    expect(electron.windows).toHaveLength(1);
    expect(electron.windows[0].focusCount).toBe(1);
    expect(overlayStates).toEqual([true]);
  });

  it('an unknown display id falls back to the primary display', () => {
    const { overlay, electron } = setup();
    overlay.open('99');
    electron.windows[0].finishLoad();
    expect(electron.windows[0].sent[0][1].width).toBe(electron.primary.size.width);
  });

  it('closing the window flags the overlay closed and allows a fresh open', () => {
    const { overlay, electron, overlayStates } = setup();
    overlay.open('1');
    overlay.close();
    expect(overlayStates).toEqual([true, false]);
    overlay.open('1');
    expect(electron.windows).toHaveLength(2);
  });

  it('close without a window is a no-op', () => {
    const { overlay, overlayStates } = setup();
    overlay.close();
    expect(overlayStates).toEqual([]);
  });
});

describe('OverlayWindow IPC channels', () => {
  it('registers every overlay channel with ipcMain.on', () => {
    const { handlers } = setup();
    expect(Object.keys(handlers).sort()).toEqual([
      'open-overlay',
      'overlay-cancel',
      'overlay-unpin-tasks',
      'pin-task',
      'save-positions',
      'unpin-task',
    ]);
  });

  it('pin-task pins on the given display, defaulting to "default", then forces a refresh', () => {
    const { fire, pinnedQueries, refresh } = setup();
    fire('pin-task', { taskId: 5, displayId: '2' });
    fire('pin-task', { taskId: 6 });
    expect(pinnedQueries.pinTask.mock.calls).toEqual([
      [{ taskId: 5, displayId: '2' }],
      [{ taskId: 6, displayId: 'default' }],
    ]);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(refresh).toHaveBeenCalledWith({ force: true });
  });

  it('unpin-task unpins from one display when given, from all otherwise', () => {
    const { fire, pinnedQueries, refresh } = setup();
    fire('unpin-task', { taskId: 5, displayId: '2' });
    fire('unpin-task', { taskId: 6 });
    expect(pinnedQueries.unpinTask).toHaveBeenCalledWith({ taskId: 5, displayId: '2' });
    expect(pinnedQueries.unpinTaskFromAll).toHaveBeenCalledWith(6);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('open-overlay opens on the requested display, defaulting to "default"', () => {
    const { fire, electron } = setup();
    fire('open-overlay', { displayId: '2' });
    electron.windows[0].finishLoad();
    expect(electron.windows[0].sent[0][1].displayId).toBe('2');
    fire('overlay-cancel');
    fire('open-overlay', {});
    electron.windows[1].finishLoad();
    expect(electron.windows[1].sent[0][1].displayId).toBe('default');
  });

  it('overlay-unpin-tasks unpins each task from all displays without refreshing', () => {
    const { fire, pinnedQueries, refresh } = setup();
    fire('overlay-unpin-tasks', [1, 2]);
    expect(pinnedQueries.unpinTaskFromAll.mock.calls).toEqual([[1], [2]]);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('save-positions persists, flags the overlay closed, closes the window and refreshes', () => {
    const { fire, overlay, pinnedQueries, overlayStates, electron, refresh } = setup();
    overlay.open('1');
    fire('save-positions', [{ id: 1 }]);
    expect(pinnedQueries.updatePositions).toHaveBeenCalledWith([{ id: 1 }]);
    expect(electron.windows[0].destroyed).toBe(true);
    expect(overlayStates[0]).toBe(true);
    expect(overlayStates.slice(1)).toEqual([false, false]);
    expect(refresh).toHaveBeenCalledWith({ force: true });
  });

  it('overlay-cancel closes the window without persisting', () => {
    const { fire, overlay, pinnedQueries, electron } = setup();
    overlay.open('1');
    fire('overlay-cancel');
    expect(electron.windows[0].destroyed).toBe(true);
    expect(pinnedQueries.updatePositions).not.toHaveBeenCalled();
  });
});

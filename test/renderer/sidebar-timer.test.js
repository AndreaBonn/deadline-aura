'use strict';

const {
  parseStoredTimer,
  createTimerState,
  TimerController,
} = require('../../renderer/sidebar-timer');
const saved = {
  taskId: '東京',
  startTime: '2026-10-19T09:00:00.000Z',
  calendarId: 'work',
  eventId: 'event-1',
  summary: 'Résumé',
};

describe('parseStoredTimer', () => {
  it.each([null, undefined, '', '{broken', 'null', '{}', '[]', 'false', '123', '"text"'])(
    'rejects %s',
    (raw) => {
      expect(parseStoredTimer(raw)).toBeNull();
    },
  );

  it.each(Object.keys(saved))('rejects missing %s', (field) => {
    const incomplete = { ...saved };
    delete incomplete[field];
    expect(parseStoredTimer(JSON.stringify(incomplete))).toBeNull();
  });

  it('preserves all fields of valid persisted state', () => {
    expect(parseStoredTimer(JSON.stringify(saved))).toEqual(saved);
  });

  it('allows an empty summary and preserves long unicode text', () => {
    expect(parseStoredTimer(JSON.stringify({ ...saved, summary: '' }))).toEqual({
      ...saved,
      summary: '',
    });
    const long = { ...saved, summary: 'è東京'.repeat(2000) };
    expect(parseStoredTimer(JSON.stringify(long))).toEqual(long);
  });
});

describe('createTimerState', () => {
  it('creates an unsynced timer from explicit data without mutating the task', () => {
    const task = Object.freeze({ id: saved.taskId, title: 'Original title' });
    expect(
      createTimerState(task, { startTime: saved.startTime, calendarId: 'work', summary: 'Résumé' }),
    ).toEqual({ ...saved, eventId: null });
    expect(task.title).toBe('Original title');
  });
});

describe('TimerController', () => {
  const KEY = 'deadlineaura_active_timer';
  const NOW = new Date('2026-10-19T09:30:00.000Z');
  let store;
  let api;
  let state;
  let rerender;
  let element;
  let controller;

  beforeEach(() => {
    vi.useFakeTimers();
    store = new Map();
    api = {
      logTimeToCalendar: vi.fn().mockResolvedValue({ ok: true, eventId: 'ev-1' }),
      updateCalendarEvent: vi.fn().mockResolvedValue({ ok: true }),
      setDefaultLogCalendar: vi.fn(),
    };
    state = {
      activeTimer: null,
      timerUiInterval: null,
      timerSyncInterval: null,
      timerPickerTaskId: 'T1',
      temporaryLoggedTaskId: null,
    };
    rerender = vi.fn();
    element = { textContent: '' };
    controller = new TimerController({
      state,
      storage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, v),
        removeItem: (k) => store.delete(k),
      },
      getApi: () => api,
      now: () => NOW,
      rerender,
      summaryFor: (task) => `summary of ${task.title}`,
      formatElapsed: (iso) => `elapsed since ${iso}`,
      root: { querySelector: (sel) => (sel.includes('"T1"') ? element : null) },
    });
  });
  afterEach(() => vi.useRealTimers());

  const task = { id: 'T1', title: 'Write report' };

  it('start persists the new timer, then stores the event id and arms both intervals', async () => {
    await controller.start(task, 'work');

    expect(api.logTimeToCalendar).toHaveBeenCalledWith({
      summary: 'summary of Write report',
      startTime: NOW.toISOString(),
      durationMinutes: 30,
      calendarId: 'work',
    });
    expect(JSON.parse(store.get(KEY))).toEqual({
      taskId: 'T1',
      startTime: NOW.toISOString(),
      calendarId: 'work',
      eventId: 'ev-1',
      summary: 'summary of Write report',
    });
    expect(api.setDefaultLogCalendar).toHaveBeenCalledWith('work');
    expect(state.timerPickerTaskId).toBeNull();
    expect(state.timerUiInterval).not.toBeNull();
    expect(state.timerSyncInterval).not.toBeNull();
    controller.clearIntervals();
  });

  it('start shows the timer immediately, before the calendar answers', () => {
    api.logTimeToCalendar.mockReturnValue(new Promise(() => {}));
    controller.start(task, 'work');
    expect(state.activeTimer).toMatchObject({ taskId: 'T1', eventId: null });
    expect(rerender).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ok without event id', { ok: true }],
    ['a failed result', { ok: false }],
  ])('start rolls back state, storage and intervals on %s', async (_label, result) => {
    api.logTimeToCalendar.mockResolvedValue(result);
    await controller.start(task, 'work');

    expect(state.activeTimer).toBeNull();
    expect(store.has(KEY)).toBe(false);
    expect(state.timerUiInterval).toBeNull();
    expect(state.timerSyncInterval).toBeNull();
    expect(api.setDefaultLogCalendar).not.toHaveBeenCalled();
    expect(rerender).toHaveBeenCalledTimes(2);
  });

  it('stop closes the event, clears state and shows "logged" for exactly 3 seconds', async () => {
    await controller.start(task, 'work');
    rerender.mockClear();

    await controller.stop();

    expect(api.updateCalendarEvent).toHaveBeenCalledWith({
      calendarId: 'work',
      eventId: 'ev-1',
      endTime: NOW.toISOString(),
    });
    expect(state.activeTimer).toBeNull();
    expect(store.has(KEY)).toBe(false);
    expect(state.timerUiInterval).toBeNull();
    expect(state.temporaryLoggedTaskId).toBe('T1');
    vi.advanceTimersByTime(2999);
    expect(state.temporaryLoggedTaskId).toBe('T1');
    vi.advanceTimersByTime(1);
    expect(state.temporaryLoggedTaskId).toBeNull();
    expect(rerender).toHaveBeenCalledTimes(2);
  });

  it('stop without an event id only clears the timer', async () => {
    state.activeTimer = { taskId: 'T1', eventId: null, calendarId: 'work' };
    await controller.stop();
    expect(api.updateCalendarEvent).not.toHaveBeenCalled();
    expect(state.activeTimer).toBeNull();
    expect(rerender).toHaveBeenCalledTimes(1);
  });

  it('stop with no running timer does nothing', async () => {
    await controller.stop();
    expect(rerender).not.toHaveBeenCalled();
    expect(api.updateCalendarEvent).not.toHaveBeenCalled();
  });

  it('restore reloads a valid stored timer and restarts the intervals', () => {
    store.set(KEY, JSON.stringify(saved));
    controller.restore();
    expect(state.activeTimer).toEqual(saved);
    expect(state.timerUiInterval).not.toBeNull();
    controller.clearIntervals();
  });

  it.each(['{broken', '{"taskId":"x"}'])('restore discards corrupt storage %s', (raw) => {
    store.set(KEY, raw);
    controller.restore();
    expect(state.activeTimer).toBeNull();
    expect(store.has(KEY)).toBe(false);
  });

  it('restore with empty storage leaves everything untouched', () => {
    controller.restore();
    expect(state.activeTimer).toBeNull();
    expect(state.timerUiInterval).toBeNull();
  });

  it('syncs the event end time every minute and refreshes the elapsed label every second', async () => {
    await controller.start(task, 'work');

    vi.advanceTimersByTime(1000);
    expect(element.textContent).toBe(`elapsed since ${NOW.toISOString()}`);
    expect(api.updateCalendarEvent).not.toHaveBeenCalled();
    vi.advanceTimersByTime(59000);
    expect(api.updateCalendarEvent).toHaveBeenCalledTimes(1);
    expect(api.updateCalendarEvent).toHaveBeenCalledWith({
      calendarId: 'work',
      eventId: 'ev-1',
      endTime: NOW.toISOString(),
    });
    controller.clearIntervals();
  });

  it('sync skips timers without an event id and logs failures instead of throwing', async () => {
    state.activeTimer = { taskId: 'T1', eventId: null, calendarId: 'work' };
    controller.sync();
    expect(api.updateCalendarEvent).not.toHaveBeenCalled();

    state.activeTimer.eventId = 'ev-1';
    api.updateCalendarEvent.mockRejectedValue(new Error('offline'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    controller.sync();
    await Promise.resolve();
    await Promise.resolve();
    expect(log).toHaveBeenCalledWith('timer sync failed:', 'offline');
    log.mockRestore();
  });

  it('updateDisplay ignores a missing element and an absent timer', () => {
    controller.updateDisplay();
    state.activeTimer = { taskId: 'other', startTime: 'x' };
    expect(() => controller.updateDisplay()).not.toThrow();
    expect(element.textContent).toBe('');
  });

  describe('stop() while start() is still waiting for the calendar', () => {
    const STOP_AT = new Date('2026-10-19T09:31:00.000Z');
    let answer;
    beforeEach(() => {
      api.logTimeToCalendar.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    });

    it('closes the late-created event at the stop moment instead of leaving it orphaned', async () => {
      let clock = NOW;
      controller.deps.now = () => clock;
      const started = controller.start(task, 'work');
      clock = STOP_AT;
      await controller.stop();
      answer({ ok: true, eventId: 'late-1' });
      await started;

      expect(api.updateCalendarEvent).toHaveBeenCalledWith({
        calendarId: 'work',
        eventId: 'late-1',
        endTime: STOP_AT.toISOString(),
      });
      expect(state.activeTimer).toBeNull();
      expect(store.has(KEY)).toBe(false);
      expect(state.timerUiInterval).toBeNull();
      expect(state.timerSyncInterval).toBeNull();
      expect(api.setDefaultLogCalendar).not.toHaveBeenCalled();
    });

    it('does nothing for a failed late answer after stop', async () => {
      const started = controller.start(task, 'work');
      await controller.stop();
      answer({ ok: false });
      await started;
      expect(api.updateCalendarEvent).not.toHaveBeenCalled();
      expect(state.activeTimer).toBeNull();
    });

    it('does not attach the late event to a timer started after the stop', async () => {
      const first = controller.start(task, 'work');
      await controller.stop();
      api.logTimeToCalendar.mockResolvedValue({ ok: true, eventId: 'ev-2' });
      await controller.start({ id: 'T2', title: 'Other' }, 'work');
      answer({ ok: true, eventId: 'late-1' });
      await first;

      expect(state.activeTimer).toMatchObject({ taskId: 'T2', eventId: 'ev-2' });
      expect(api.updateCalendarEvent).toHaveBeenCalledWith(
        expect.objectContaining({ eventId: 'late-1' }),
      );
      controller.clearIntervals();
    });

    it('a failed late answer of the first timer does not roll back the second one', async () => {
      const first = controller.start(task, 'work');
      await controller.stop();
      api.logTimeToCalendar.mockResolvedValue({ ok: true, eventId: 'ev-2' });
      await controller.start({ id: 'T2', title: 'Other' }, 'work');
      answer({ ok: false });
      await first;
      expect(state.activeTimer).toMatchObject({ taskId: 'T2', eventId: 'ev-2' });
      controller.clearIntervals();
    });
  });

  it('start rolls back state, storage and intervals when the IPC call rejects', async () => {
    api.logTimeToCalendar.mockRejectedValue(new Error('ipc down'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(controller.start(task, 'work')).resolves.toBeUndefined();

    expect(state.activeTimer).toBeNull();
    expect(store.has(KEY)).toBe(false);
    expect(state.timerUiInterval).toBeNull();
    expect(state.timerSyncInterval).toBeNull();
    expect(api.setDefaultLogCalendar).not.toHaveBeenCalled();
    expect(rerender).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith('timer start failed:', 'ipc down');
    log.mockRestore();
  });

  it('stop keeps the timer stopped, shows no "logged" badge and logs when closing the event rejects', async () => {
    await controller.start(task, 'work');
    rerender.mockClear();
    api.updateCalendarEvent.mockRejectedValue(new Error('ipc down'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(controller.stop()).resolves.toBeUndefined();

    expect(state.activeTimer).toBeNull();
    expect(store.has(KEY)).toBe(false);
    expect(state.temporaryLoggedTaskId).toBeNull();
    expect(rerender).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('timer stop failed:', 'ipc down');
    log.mockRestore();
  });

  it('stop shows no "logged" badge and logs when the calendar refuses to close the event', async () => {
    await controller.start(task, 'work');
    rerender.mockClear();
    api.updateCalendarEvent.mockResolvedValue({ ok: false, error: 'quota exceeded' });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    await controller.stop();

    expect(state.activeTimer).toBeNull();
    expect(state.temporaryLoggedTaskId).toBeNull();
    expect(rerender).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('timer stop failed:', 'quota exceeded');
    log.mockRestore();
  });

  it('logs when the calendar refuses to close the event of a timer stopped while starting', async () => {
    let answer;
    api.logTimeToCalendar.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    api.updateCalendarEvent.mockResolvedValue({ ok: false, error: 'quota exceeded' });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const starting = controller.start(task, 'work');
    await controller.stop();

    answer({ ok: true, eventId: 'ev-late' });
    await starting;
    await Promise.resolve();

    expect(api.updateCalendarEvent).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('closing the late timer event failed:', 'quota exceeded');
    log.mockRestore();
  });

  it('logs when the calendar refuses the periodic sync of the running timer', async () => {
    await controller.start(task, 'work');
    api.updateCalendarEvent.mockResolvedValue({ ok: false, error: 'quota exceeded' });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    controller.sync();
    await Promise.resolve();
    await Promise.resolve();

    expect(api.updateCalendarEvent).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('timer sync failed:', 'quota exceeded');
    log.mockRestore();
    controller.clearIntervals();
  });
});

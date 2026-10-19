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
});

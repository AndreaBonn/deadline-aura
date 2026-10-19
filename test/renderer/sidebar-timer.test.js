'use strict';

const { parseStoredTimer, createTimerState } = require('../../renderer/sidebar-timer');
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

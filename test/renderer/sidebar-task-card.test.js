'use strict';

const { taskMenuModel, primaryActionsModel } = require('../../renderer/sidebar-task-card');

const ready = { isPinned: false, googleCalendarReady: true };
const ids = (model) => model.map((item) => item.id);

describe('taskMenuModel', () => {
  it('offers edit, pin, log time and delete for a local task, in that order', () => {
    expect(taskMenuModel({ source: 'local' }, ready)).toEqual([
      { id: 'edit', labelKey: 'common.edit', icon: 'edit' },
      { id: 'pin', labelKey: 'sidebar.pin_to_desktop', icon: 'pin' },
      { id: 'log-time', labelKey: 'sidebar.log_time', icon: 'clock' },
      { id: 'delete', labelKey: 'common.delete', icon: 'trash', danger: true },
    ]);
  });

  it('offers only pin and log time for a Jira task, never edit or delete', () => {
    expect(ids(taskMenuModel({ source: 'jira' }, ready))).toEqual(['pin', 'log-time']);
  });

  it('switches pin to unpin once the task is pinned', () => {
    const model = taskMenuModel({ source: 'jira' }, { ...ready, isPinned: true });
    expect(model[0]).toEqual({
      id: 'unpin',
      labelKey: 'sidebar.unpin_from_desktop',
      icon: 'unpin',
    });
  });

  it('points to the Google setup instead of the time-log form when Google is not ready', () => {
    const model = taskMenuModel({ source: 'local' }, { ...ready, googleCalendarReady: false });
    expect(ids(model)).toEqual(['edit', 'pin', 'connect-google', 'delete']);
    expect(model[2].labelKey).toBe('sidebar.google_connect');
  });

  it.each(['gcal', 'outlook', 'gtasks', undefined])('has no menu for source %s', (source) => {
    expect(taskMenuModel({ source }, ready)).toEqual([]);
  });

  it('only the delete entry is dangerous', () => {
    const dangerous = taskMenuModel({ source: 'local' }, ready).filter((item) => item.danger);
    expect(ids(dangerous)).toEqual(['delete']);
  });
});

describe('primaryActionsModel', () => {
  const idle = { isFavorite: false, isTimerActive: false, googleCalendarReady: true };

  it('gives a local task a complete button and a timer, no favorite', () => {
    expect(primaryActionsModel({ source: 'local' }, idle)).toEqual({
      complete: true,
      favorite: null,
      timer: true,
    });
  });

  it('gives a Jira task a favorite button carrying its state and a timer, no complete', () => {
    expect(primaryActionsModel({ source: 'jira' }, { ...idle, isFavorite: true })).toEqual({
      complete: false,
      favorite: { isFavorite: true },
      timer: true,
    });
  });

  it('hides the timer when Google is not ready unless the timer is already running', () => {
    const off = { ...idle, googleCalendarReady: false };
    expect(primaryActionsModel({ source: 'local' }, off).timer).toBe(false);
    expect(primaryActionsModel({ source: 'local' }, { ...off, isTimerActive: true }).timer).toBe(
      true,
    );
  });

  it.each(['gcal', 'outlook', 'gtasks'])('shows nothing for source %s', (source) => {
    expect(primaryActionsModel({ source }, { ...idle, isTimerActive: true })).toEqual({
      complete: false,
      favorite: null,
      timer: false,
    });
  });
});

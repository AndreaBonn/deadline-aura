'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

vi.spyOn(os, 'homedir').mockReturnValue(
  path.join(os.tmpdir(), 'deadlineaura-db-missing-home-' + process.pid),
);

const db = require('../../store/db');

afterAll(() => {
  db.close();
  const dataDir = path.join(
    os.tmpdir(),
    'deadlineaura-db-missing-home-' + process.pid,
    '.local',
    'share',
    'deadlineaura',
  );
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  db.getDb().prepare('DELETE FROM tasks').run();
  db.getDb().prepare('DELETE FROM ai_cache').run();
  db.getDb().prepare('DELETE FROM scores').run();
});

function insertTask(overrides = {}) {
  db.upsertTask({
    id: 'task_default',
    source: 'gcal',
    title: 'Default Task',
    due_at: Date.now() + 24 * 3600000,
    start_at: null,
    priority: 3,
    is_done: 0,
    web_url: null,
    raw_json: '{}',
    synced_at: Date.now(),
    ...overrides,
  });
}

describe('db — getUpcomingCalendarEvents', () => {
  it('does not return done tasks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    try {
      const start_at = Date.now() + 3600000;
      insertTask({ id: 'done_gcal', start_at, is_done: 1 });
      insertTask({ id: 'active_gcal', start_at });

      const results = db.getUpcomingCalendarEvents(24 * 3600000);

      expect(results.map((event) => event.id)).toEqual(['active_gcal']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns empty array when no gcal tasks exist', () => {
    const results = db.getUpcomingCalendarEvents(24 * 3600000);
    expect(results).toHaveLength(0);
  });

  it('returns gcal task when start_at is within horizon', () => {
    const now = Date.now();
    insertTask({
      id: 'gcal_upcoming',
      source: 'gcal',
      start_at: now + 3600000,
      due_at: now + 7200000,
    });

    const results = db.getUpcomingCalendarEvents(24 * 3600000);
    expect(results.some((r) => r.id === 'gcal_upcoming')).toBe(true);
  });

  it('returns gcal task using due_at when start_at is null and due_at within horizon', () => {
    const now = Date.now();
    insertTask({
      id: 'gcal_noduestart',
      source: 'gcal',
      start_at: null,
      due_at: now + 3600000,
    });

    const results = db.getUpcomingCalendarEvents(24 * 3600000);
    expect(results.some((r) => r.id === 'gcal_noduestart')).toBe(true);
  });

  it('does not return jira tasks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T12:00:00Z'));
    try {
      const start_at = Date.now() + 3600000;
      insertTask({ id: 'jira_task', source: 'jira', start_at: null });
      insertTask({ id: 'jira_with_start', source: 'jira', start_at });
      insertTask({ id: 'gcal_active', start_at });

      const results = db.getUpcomingCalendarEvents(24 * 3600000);

      expect(results.map((event) => event.id)).toEqual(['gcal_active']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not return tasks outside horizon', () => {
    insertTask({
      id: 'gcal_far',
      source: 'gcal',
      start_at: Date.now() + 25 * 3600000,
      due_at: Date.now() + 26 * 3600000,
    });

    const results = db.getUpcomingCalendarEvents(24 * 3600000);
    expect(results.some((r) => r.id === 'gcal_far')).toBe(false);
  });

  it('does not return stale tasks', () => {
    insertTask({ id: 'gcal_stale', source: 'gcal', start_at: Date.now() + 3600000 });
    db.getDb().prepare('UPDATE tasks SET is_stale = 1 WHERE id = ?').run('gcal_stale');

    const results = db.getUpcomingCalendarEvents(24 * 3600000);
    expect(results.some((r) => r.id === 'gcal_stale')).toBe(false);
  });

  it('orders results by COALESCE(start_at, due_at) ascending', () => {
    const now = Date.now();
    insertTask({ id: 'gcal_later', source: 'gcal', start_at: now + 5 * 3600000 });
    insertTask({ id: 'gcal_sooner', source: 'gcal', start_at: now + 1 * 3600000 });

    const results = db.getUpcomingCalendarEvents(24 * 3600000);
    const ids = results.map((r) => r.id);
    expect(ids.indexOf('gcal_sooner')).toBeLessThan(ids.indexOf('gcal_later'));
  });
});

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
    insertTask({ id: 'jira_task', source: 'jira', start_at: null });

    const results = db.getUpcomingCalendarEvents(24 * 3600000);
    expect(results.every((r) => r.source === 'gcal')).toBe(true);
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

describe('db — getLatestAiScore', () => {
  it('returns null when ai_cache is empty', () => {
    const result = db.getLatestAiScore();
    expect(result).toBeNull();
  });

  it('returns global_stress and computed_at for valid cache entry', () => {
    db.setAiCache('hash123', JSON.stringify({ global_stress: 7, per_event: [] }));
    const result = db.getLatestAiScore();
    expect(result).not.toBeNull();
    expect(result.global_stress).toBe(7);
    expect(typeof result.computed_at).toBe('number');
  });

  it('returns null when response_json is malformed', () => {
    db.getDb()
      .prepare('INSERT INTO ai_cache (events_hash, response_json, computed_at) VALUES (?,?,?)')
      .run('bad_hash', '{ not valid json', Date.now());

    const result = db.getLatestAiScore();
    expect(result).toBeNull();
  });
});

describe('db — cleanupOldRecords', () => {
  it('deletes scores older than 7 days', () => {
    const oldTs = Date.now() - 8 * 24 * 3600000;
    db.getDb().prepare('INSERT INTO scores (global_score, computed_at) VALUES (?,?)').run(0.5, oldTs);

    db.cleanupOldRecords();

    const remaining = db.getDb().prepare('SELECT * FROM scores').all();
    expect(remaining.every((r) => r.computed_at >= Date.now() - 7 * 24 * 3600000)).toBe(true);
  });

  it('deletes stale tasks older than 48 hours', () => {
    const oldSyncedAt = Date.now() - 3 * 24 * 3600000;
    db.getDb()
      .prepare(
        `INSERT INTO tasks (id, source, title, priority, is_done, is_stale, raw_json, synced_at)
         VALUES (?,?,?,?,?,?,?,?)`,
      )
      .run('stale_old', 'gcal', 'Old Stale', 3, 0, 1, '{}', oldSyncedAt);

    db.cleanupOldRecords();

    const row = db.getDb().prepare('SELECT * FROM tasks WHERE id = ?').get('stale_old');
    expect(row).toBeUndefined();
  });

  it('keeps recent stale tasks (within 48 hours)', () => {
    insertTask({ id: 'stale_recent' });
    db.getDb().prepare('UPDATE tasks SET is_stale = 1 WHERE id = ?').run('stale_recent');

    db.cleanupOldRecords();

    const row = db.getDb().prepare('SELECT * FROM tasks WHERE id = ?').get('stale_recent');
    expect(row).toBeDefined();
  });

  it('deletes ai_cache entries older than 7 days', () => {
    const oldTs = Date.now() - 8 * 24 * 3600000;
    db.getDb()
      .prepare('INSERT INTO ai_cache (events_hash, response_json, computed_at) VALUES (?,?,?)')
      .run('old_hash', '{}', oldTs);

    db.cleanupOldRecords();

    const row = db.getDb().prepare('SELECT * FROM ai_cache WHERE events_hash = ?').get('old_hash');
    expect(row).toBeUndefined();
  });

  it('does not throw on empty tables', () => {
    expect(() => db.cleanupOldRecords()).not.toThrow();
  });
});

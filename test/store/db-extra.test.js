'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

vi.spyOn(os, 'homedir').mockReturnValue(
  path.join(os.tmpdir(), 'deadlineaura-db-extra-' + process.pid),
);

const db = require('../../store/db');

const SAMPLE_TASK = {
  id: 'extra_task_1',
  source: 'gcal',
  title: 'Extra Test Task',
  due_at: Date.now() + 24 * 3600000,
  priority: 3,
  is_done: 0,
  web_url: null,
  raw_json: '{"summary":"Test"}',
  synced_at: Date.now(),
};

afterAll(() => {
  db.close();
  const dataDir = path.join(
    os.tmpdir(),
    'deadlineaura-db-extra-' + process.pid,
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
  db.getDb().prepare('DELETE FROM scores').run();
  db.getDb().prepare('DELETE FROM ai_cache').run();
});

describe('db — deleteTask', () => {
  it('deletes existing task and returns changes=1', () => {
    db.upsertTask({ ...SAMPLE_TASK, id: 'to_delete' });
    const result = db.deleteTask('to_delete');
    expect(result.changes).toBe(1);

    const row = db.getDb().prepare('SELECT * FROM tasks WHERE id = ?').get('to_delete');
    expect(row).toBeUndefined();
  });

  it('returns changes=0 for non-existent task', () => {
    const result = db.deleteTask('nonexistent');
    expect(result.changes).toBe(0);
  });
});

describe('db — markTaskDone', () => {
  it('sets is_done=1 on existing task', () => {
    db.upsertTask({ ...SAMPLE_TASK, id: 'mark_done' });
    const result = db.markTaskDone('mark_done');
    expect(result.changes).toBe(1);

    const row = db.getDb().prepare('SELECT is_done FROM tasks WHERE id = ?').get('mark_done');
    expect(row.is_done).toBe(1);
  });

  it('returns changes=0 for non-existent task', () => {
    const result = db.markTaskDone('ghost');
    expect(result.changes).toBe(0);
  });
});

describe('db — getLatestAiScore', () => {
  it('returns null when no AI cache entries exist', () => {
    expect(db.getLatestAiScore()).toBeNull();
  });

  it('returns global_stress and computed_at from latest cache entry', () => {
    db.setAiCache('hash1', JSON.stringify({ global_stress: 7, per_event: [] }));
    const result = db.getLatestAiScore();
    expect(result.global_stress).toBe(7);
    expect(result.computed_at).toBeGreaterThan(0);
  });

  it('returns latest entry when multiple exist', () => {
    const now = Date.now();
    db.getDb()
      .prepare('INSERT INTO ai_cache (events_hash, response_json, computed_at) VALUES (?, ?, ?)')
      .run('hash_old', JSON.stringify({ global_stress: 3, per_event: [] }), now - 1000);
    db.getDb()
      .prepare('INSERT INTO ai_cache (events_hash, response_json, computed_at) VALUES (?, ?, ?)')
      .run('hash_new', JSON.stringify({ global_stress: 8, per_event: [] }), now);
    const result = db.getLatestAiScore();
    expect(result.global_stress).toBe(8);
  });

  it('returns null for malformed JSON in cache', () => {
    db.getDb()
      .prepare('INSERT INTO ai_cache (events_hash, response_json, computed_at) VALUES (?, ?, ?)')
      .run('bad_json', '{invalid', Date.now());
    expect(db.getLatestAiScore()).toBeNull();
  });
});

describe('db — getUpcomingCalendarEvents', () => {
  it('returns gcal events within horizon', () => {
    const now = Date.now();
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'gcal_soon',
      source: 'gcal',
      start_at: now + 3600000,
      due_at: now + 7200000,
    });
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'gcal_far',
      source: 'gcal',
      start_at: now + 48 * 3600000,
      due_at: now + 49 * 3600000,
    });
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'jira_task',
      source: 'jira',
      start_at: now + 3600000,
    });

    const events = db.getUpcomingCalendarEvents(24 * 3600000);
    const ids = events.map((e) => e.id);

    expect(ids).toContain('gcal_soon');
    expect(ids).not.toContain('gcal_far');
    expect(ids).not.toContain('jira_task');
  });

  it('falls back to due_at when start_at is null', () => {
    const now = Date.now();
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'gcal_nostart',
      source: 'gcal',
      start_at: null,
      due_at: now + 3600000,
    });

    const events = db.getUpcomingCalendarEvents(24 * 3600000);
    expect(events.find((e) => e.id === 'gcal_nostart')).toBeDefined();
  });

  it('excludes done and stale events', () => {
    const now = Date.now();
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'done_gcal',
      source: 'gcal',
      start_at: now + 3600000,
      is_done: 1,
    });
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'stale_gcal',
      source: 'gcal',
      start_at: now + 3600000,
    });
    db.getDb().prepare('UPDATE tasks SET is_stale = 1 WHERE id = ?').run('stale_gcal');

    const events = db.getUpcomingCalendarEvents(24 * 3600000);
    const ids = events.map((e) => e.id);
    expect(ids).not.toContain('done_gcal');
    expect(ids).not.toContain('stale_gcal');
  });

  it('returns empty array when no gcal events exist', () => {
    expect(db.getUpcomingCalendarEvents(24 * 3600000)).toEqual([]);
  });
});

describe('db — getUpcomingMeetings', () => {
  // New signature: getUpcomingMeetings(beforeMinutes, afterMinutes)
  // beforeMinutes = lookahead (positive, e.g. 10 = show 10 min before start)
  // afterMinutes = grace period (negative, e.g. -5 = show until 5 min after start)

  it('returns gcal events with meet_url within window', () => {
    const now = Date.now();
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'gcal_meet',
      source: 'gcal',
      start_at: now + 300000,
      meet_url: 'https://meet.google.com/abc',
    });
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'gcal_nomeet',
      source: 'gcal',
      start_at: now + 300000,
      meet_url: null,
    });

    const meetings = db.getUpcomingMeetings(10, -5);
    const ids = meetings.map((m) => m.id);
    expect(ids).toContain('gcal_meet');
    expect(ids).not.toContain('gcal_nomeet');
  });

  it('excludes meetings outside lookahead window', () => {
    const now = Date.now();
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'gcal_far_meet',
      source: 'gcal',
      start_at: now + 20 * 60000,
      meet_url: 'https://meet.google.com/xyz',
    });

    const meetings = db.getUpcomingMeetings(10, -5);
    expect(meetings.some((m) => m.id === 'gcal_far_meet')).toBe(false);
  });

  it('includes meetings that started up to afterMinutes ago', () => {
    const now = Date.now();
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'gcal_just_started',
      source: 'gcal',
      start_at: now - 3 * 60000,
      meet_url: 'https://meet.google.com/started',
    });

    const meetings = db.getUpcomingMeetings(10, -5);
    expect(meetings.some((m) => m.id === 'gcal_just_started')).toBe(true);
  });

  it('excludes meetings that started more than afterMinutes ago', () => {
    const now = Date.now();
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'gcal_old_started',
      source: 'gcal',
      start_at: now - 10 * 60000,
      meet_url: 'https://meet.google.com/old',
    });

    const meetings = db.getUpcomingMeetings(10, -5);
    expect(meetings.some((m) => m.id === 'gcal_old_started')).toBe(false);
  });

  it('excludes done and stale meetings', () => {
    const now = Date.now();
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'gcal_done_meet',
      source: 'gcal',
      start_at: now + 300000,
      is_done: 1,
      meet_url: 'https://meet.google.com/done',
    });
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'gcal_stale_meet',
      source: 'gcal',
      start_at: now + 300000,
      meet_url: 'https://meet.google.com/stale',
    });
    db.getDb().prepare('UPDATE tasks SET is_stale = 1 WHERE id = ?').run('gcal_stale_meet');

    const meetings = db.getUpcomingMeetings(10, -5);
    const ids = meetings.map((m) => m.id);
    expect(ids).not.toContain('gcal_done_meet');
    expect(ids).not.toContain('gcal_stale_meet');
  });

  it('excludes events without start_at', () => {
    const now = Date.now();
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'gcal_nostart_meet',
      source: 'gcal',
      start_at: null,
      due_at: now + 300000,
      meet_url: 'https://meet.google.com/nostart',
    });

    const meetings = db.getUpcomingMeetings(10, -5);
    expect(meetings.some((m) => m.id === 'gcal_nostart_meet')).toBe(false);
  });

  it('returns empty array when no meetings exist', () => {
    expect(db.getUpcomingMeetings(10, -5)).toEqual([]);
  });

  it('orders by start_at ascending', () => {
    const now = Date.now();
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'gcal_later_meet',
      source: 'gcal',
      start_at: now + 500000,
      meet_url: 'https://meet.google.com/later',
    });
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'gcal_sooner_meet',
      source: 'gcal',
      start_at: now + 100000,
      meet_url: 'https://meet.google.com/sooner',
    });

    const meetings = db.getUpcomingMeetings(10, -5);
    const ids = meetings.map((m) => m.id);
    expect(ids.indexOf('gcal_sooner_meet')).toBeLessThan(ids.indexOf('gcal_later_meet'));
  });
});

describe('db — getActiveTasks with local source', () => {
  it('includes local tasks regardless of due_at', () => {
    db.upsertTask({
      ...SAMPLE_TASK,
      id: 'local_far',
      source: 'local',
      due_at: Date.now() + 999 * 3600000,
    });

    const tasks = db.getActiveTasks(72 * 3600000);
    expect(tasks.find((t) => t.id === 'local_far')).toBeDefined();
  });
});

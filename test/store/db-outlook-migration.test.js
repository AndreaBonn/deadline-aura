'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');

const HOME = path.join(os.tmpdir(), 'deadlineaura-mig008-' + process.pid);
vi.spyOn(os, 'homedir').mockReturnValue(HOME);

const DATA_DIR = path.join(HOME, '.local', 'share', 'deadlineaura');
const DB_PATH = path.join(DATA_DIR, 'db.sqlite');

// Schema as it stood before this migration: the source CHECK has no 'outlook'.
const PRE_008_SCHEMA = `
  CREATE TABLE tasks (
    id          TEXT PRIMARY KEY,
    source      TEXT NOT NULL CHECK(source IN ('gcal', 'jira', 'local', 'gtasks')),
    title       TEXT NOT NULL,
    due_at      INTEGER,
    priority    INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 4),
    is_done     INTEGER NOT NULL DEFAULT 0,
    is_stale    INTEGER NOT NULL DEFAULT 0,
    raw_json    TEXT,
    synced_at   INTEGER NOT NULL,
    ai_stress     INTEGER CHECK(ai_stress BETWEEN 1 AND 10),
    ai_category   TEXT CHECK(ai_category IN ('work-critical', 'work-routine', 'personal', 'admin', 'off')),
    ai_reasoning  TEXT,
    ai_scored_at  INTEGER,
    web_url     TEXT,
    ai_cognitive_type TEXT CHECK(ai_cognitive_type IN ('analytical', 'creative', 'social', 'passive', 'administrative')),
    start_at    INTEGER,
    meet_url    TEXT
  );
`;

function sourceCheckSql() {
  const inspector = new Database(DB_PATH, { readonly: true });
  const row = inspector.prepare("SELECT sql FROM sqlite_master WHERE name = 'tasks'").get();
  inspector.close();
  return row.sql;
}

function backupCount() {
  const dir = path.join(DATA_DIR, 'backups');
  return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
}

describe('migration 008: outlook as a task source', () => {
  let db;

  beforeAll(() => {
    fs.rmSync(HOME, { recursive: true, force: true });
    fs.mkdirSync(DATA_DIR, { recursive: true });

    const seed = new Database(DB_PATH);
    seed.exec(PRE_008_SCHEMA);
    seed
      .prepare(
        `INSERT INTO tasks (id, source, title, due_at, priority, is_done, synced_at, ai_stress)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('gcal_existing', 'gcal', 'Evento preesistente', Date.now(), 2, 0, Date.now(), 7);
    seed.close();

    db = require('../../store/db');
  });

  afterAll(() => {
    db.close();
    fs.rmSync(HOME, { recursive: true, force: true });
  });

  it('extends the source constraint to accept outlook', () => {
    db.getDb();

    expect(sourceCheckSql()).toMatch(/CHECK\(source IN \([^)]*'outlook'[^)]*\)\)/);
  });

  it('keeps the rows that existed before the rebuild, scores included', () => {
    const row = db.getDb().prepare("SELECT * FROM tasks WHERE id = 'gcal_existing'").get();

    expect(row.title).toBe('Evento preesistente');
    expect(row.ai_stress).toBe(7);
  });

  it('accepts an outlook task that the old constraint would have rejected', () => {
    db.upsertTask({
      id: 'outlook_abc_123',
      source: 'outlook',
      title: 'Standup',
      due_at: Date.now() + 3600000,
      start_at: Date.now(),
      priority: 3,
      is_done: 0,
      web_url: null,
      meet_url: null,
      raw_json: '{}',
      synced_at: Date.now(),
    });

    const row = db.getDb().prepare("SELECT * FROM tasks WHERE id = 'outlook_abc_123'").get();
    expect(row.source).toBe('outlook');
  });

  it('does not rebuild the table again on a later open', () => {
    const before = backupCount();

    db.close();
    db.getDb();

    expect(backupCount()).toBe(before);
  });

  it('surfaces outlook events to the meeting dock alongside google ones', () => {
    const inOneHour = Date.now() + 3600000;
    db.upsertTask({
      id: 'outlook_dock_1',
      source: 'outlook',
      title: 'Riunione imminente',
      due_at: inOneHour + 1800000,
      start_at: inOneHour,
      priority: 3,
      is_done: 0,
      web_url: null,
      meet_url: null,
      raw_json: '{}',
      synced_at: Date.now(),
    });

    const upcoming = db.getUpcomingCalendarEvents(4 * 3600000);

    expect(upcoming.map((e) => e.id)).toContain('outlook_dock_1');
  });

  it('leaves the flyby query on google only, given the feed refresh delay', () => {
    const inFiveMinutes = Date.now() + 5 * 60000;
    db.upsertTask({
      id: 'outlook_flyby_1',
      source: 'outlook',
      title: 'Riunione con link',
      due_at: inFiveMinutes + 1800000,
      start_at: inFiveMinutes,
      priority: 3,
      is_done: 0,
      web_url: null,
      meet_url: 'https://teams.microsoft.com/l/meetup-join/x',
      raw_json: '{}',
      synced_at: Date.now(),
    });

    const meetings = db.getUpcomingMeetings(10, 0);

    expect(meetings.map((m) => m.id)).not.toContain('outlook_flyby_1');
  });
});

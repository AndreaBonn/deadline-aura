'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'deadlineaura-migrations-'));
const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue(HOME); // os.homedir is captured on require.
const db = require('../../store/db');
const DATA_DIR = path.join(HOME, '.local', 'share', 'deadlineaura');
const DB_PATH = path.join(DATA_DIR, 'db.sqlite');

const PRE_006_SCHEMA = `CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK(source IN ('gcal', 'jira', 'local')),
  title TEXT NOT NULL,
  due_at INTEGER,
  priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 4),
  is_done INTEGER NOT NULL DEFAULT 0,
  is_stale INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT,
  synced_at INTEGER NOT NULL,
  ai_stress INTEGER CHECK(ai_stress BETWEEN 1 AND 10),
  ai_category TEXT CHECK(ai_category IN ('work-critical', 'work-routine', 'personal', 'admin')),
  ai_reasoning TEXT,
  ai_scored_at INTEGER,
  web_url TEXT,
  ai_cognitive_type TEXT CHECK(ai_cognitive_type IN ('analytical', 'creative', 'social', 'passive', 'administrative')),
  start_at INTEGER
);`;

const PINNED_SCHEMA = `CREATE TABLE pinned_tasks (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  display_id TEXT NOT NULL,
  x_pct REAL NOT NULL DEFAULT 10.0 CHECK(x_pct >= 0 AND x_pct <= 100),
  y_pct REAL NOT NULL DEFAULT 10.0 CHECK(y_pct >= 0 AND y_pct <= 100),
  pinned_at INTEGER NOT NULL,
  PRIMARY KEY (task_id, display_id)
)`;

const EXPECTED_TASKS_SQL = `CREATE TABLE "tasks" (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK(source IN ('gcal', 'jira', 'local', 'gtasks', 'outlook')),
  title TEXT NOT NULL,
  due_at INTEGER,
  priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 4),
  is_done INTEGER NOT NULL DEFAULT 0,
  is_stale INTEGER NOT NULL DEFAULT 0,
  raw_json TEXT,
  synced_at INTEGER NOT NULL,
  ai_stress INTEGER CHECK(ai_stress BETWEEN 1 AND 10),
  ai_category TEXT CHECK(ai_category IN ('work-critical', 'work-routine', 'personal', 'admin', 'off')),
  ai_reasoning TEXT,
  ai_scored_at INTEGER,
  web_url TEXT,
  ai_cognitive_type TEXT CHECK(ai_cognitive_type IN ('analytical', 'creative', 'social', 'passive', 'administrative')),
  start_at INTEGER,
  meet_url TEXT
)`;

const EXPECTED_SCHEMA = [
  [
    'index',
    'idx_jira_favorites_task',
    'CREATE INDEX idx_jira_favorites_task ON jira_favorites(task_id)',
  ],
  ['index', 'idx_pinned_display', 'CREATE INDEX idx_pinned_display ON pinned_tasks(display_id)'],
  ['index', 'idx_scores_computed_at', 'CREATE INDEX idx_scores_computed_at ON scores(computed_at)'],
  ['index', 'idx_tasks_due_at', 'CREATE INDEX idx_tasks_due_at ON tasks(due_at)'],
  ['index', 'idx_tasks_is_done', 'CREATE INDEX idx_tasks_is_done ON tasks(is_done)'],
  ['index', 'idx_tasks_source', 'CREATE INDEX idx_tasks_source ON tasks(source)'],
  ['index', 'sqlite_autoindex_ai_cache_1', null],
  ['index', 'sqlite_autoindex_config_1', null],
  ['index', 'sqlite_autoindex_jira_favorites_1', null],
  ['index', 'sqlite_autoindex_pinned_tasks_1', null],
  ['index', 'sqlite_autoindex_tasks_1', null],
  [
    'table',
    'ai_cache',
    'CREATE TABLE ai_cache ( events_hash TEXT PRIMARY KEY, response_json TEXT NOT NULL, computed_at INTEGER NOT NULL )',
  ],
  ['table', 'config', 'CREATE TABLE config ( key TEXT PRIMARY KEY, value TEXT NOT NULL )'],
  [
    'table',
    'jira_favorites',
    'CREATE TABLE jira_favorites ( task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, favorited_at INTEGER NOT NULL, PRIMARY KEY (task_id) )',
  ],
  ['table', 'pinned_tasks', PINNED_SCHEMA],
  [
    'table',
    'scores',
    'CREATE TABLE scores ( id INTEGER PRIMARY KEY AUTOINCREMENT, global_score REAL NOT NULL, computed_at INTEGER NOT NULL )',
  ],
  ['table', 'sqlite_sequence', 'CREATE TABLE sqlite_sequence(name,seq)'],
  ['table', 'tasks', EXPECTED_TASKS_SQL],
];

const EXPECTED_COLUMNS = [
  [0, 'id', 'TEXT', 0, null, 1],
  [1, 'source', 'TEXT', 1, null, 0],
  [2, 'title', 'TEXT', 1, null, 0],
  [3, 'due_at', 'INTEGER', 0, null, 0],
  [4, 'priority', 'INTEGER', 1, '3', 0],
  [5, 'is_done', 'INTEGER', 1, '0', 0],
  [6, 'is_stale', 'INTEGER', 1, '0', 0],
  [7, 'raw_json', 'TEXT', 0, null, 0],
  [8, 'synced_at', 'INTEGER', 1, null, 0],
  [9, 'ai_stress', 'INTEGER', 0, null, 0],
  [10, 'ai_category', 'TEXT', 0, null, 0],
  [11, 'ai_reasoning', 'TEXT', 0, null, 0],
  [12, 'ai_scored_at', 'INTEGER', 0, null, 0],
  [13, 'web_url', 'TEXT', 0, null, 0],
  [14, 'ai_cognitive_type', 'TEXT', 0, null, 0],
  [15, 'start_at', 'INTEGER', 0, null, 0],
  [16, 'meet_url', 'TEXT', 0, null, 0],
];

function normalizeSql(sql) {
  return sql === null ? null : sql.replace(/\s+/g, ' ').trim();
}

function readSchema(database) {
  return database
    .prepare('SELECT type, name, sql FROM sqlite_master ORDER BY type, name')
    .all()
    .map(({ type, name, sql }) => [type, name, normalizeSql(sql)]);
}

function readColumns(database) {
  return database
    .pragma('table_info(tasks)')
    .map(({ cid, name, type, notnull, dflt_value, pk }) => [
      cid,
      name,
      type,
      notnull,
      dflt_value,
      pk,
    ]);
}

function seedLegacy(rows = []) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const seed = new Database(DB_PATH);
  try {
    seed.exec(PRE_006_SCHEMA);
    // Migration guards inspect columns/CHECKs; user_version was never advanced.
    seed.pragma('user_version = 0');
    const insert =
      seed.prepare(`INSERT INTO tasks (id, source, title, raw_json, synced_at, start_at)
      VALUES (@id, @source, @id, @raw_json, 1234, @start_at)`);
    for (const row of rows) {
      insert.run({ source: 'gcal', raw_json: null, start_at: null, ...row });
    }
    return seed.prepare('SELECT * FROM tasks ORDER BY id').all();
  } finally {
    seed.close();
  }
}

beforeEach(() => {
  db.close();
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
});

afterEach(() => db.close());

afterAll(() => {
  homeSpy.mockRestore();
  fs.rmSync(HOME, { recursive: true, force: true });
});

describe('public database migration characterization', () => {
  it('creates the complete final schema on a new database', () => {
    const database = db.getDb();

    expect(readColumns(database)).toEqual(EXPECTED_COLUMNS);
    expect(readSchema(database)).toEqual(
      EXPECTED_SCHEMA.map(([type, name, sql]) => [type, name, normalizeSql(sql)]),
    );
  });

  it('preserves schema and stored rows when reopened', () => {
    const database = db.getDb();
    database.exec(`
      INSERT INTO tasks (id, source, title, synced_at) VALUES ('keep', 'local', 'Keep', 1234);
      INSERT INTO pinned_tasks VALUES ('keep', 'screen', 25, 75, 2345);
      INSERT INTO jira_favorites VALUES ('keep', 3456);
      INSERT INTO config VALUES ('theme', 'dark');
      INSERT INTO scores (global_score, computed_at) VALUES (4.5, 4567);
      INSERT INTO ai_cache VALUES ('hash', '{"score":4}', 5678);
    `);
    const schema = readSchema(database);
    const columns = readColumns(database);
    const tables = [
      'tasks',
      'pinned_tasks',
      'jira_favorites',
      'config',
      'scores',
      'ai_cache',
      'sqlite_sequence',
    ];
    const rows = tables.map((table) => database.prepare(`SELECT * FROM ${table}`).all());
    expect(rows.map((entries) => entries.length)).toEqual([1, 1, 1, 1, 1, 1, 1]);
    db.close();

    const reopened = db.getDb();

    expect(readSchema(reopened)).toEqual(schema);
    expect(readColumns(reopened)).toEqual(columns);
    expect(tables.map((table) => reopened.prepare(`SELECT * FROM ${table}`).all())).toEqual(rows);
  });

  it('backfills 005b timed and all-day starts while preserving unrelated rows', () => {
    const legacy = seedLegacy([
      { id: 'timed', raw_json: '{"start":{"dateTime":"2026-06-01T12:30:00+02:00"}}' },
      { id: 'all-day', raw_json: '{"start":{"date":"2026-06-02"}}' },
      { id: 'malformed', raw_json: '{broken' },
      {
        id: 'jira',
        source: 'jira',
        raw_json: '{"start":{"dateTime":"2026-06-01T12:30:00+02:00"}}',
      },
      { id: 'already-set', start_at: 42, raw_json: '{"start":{"date":"2026-06-02"}}' },
    ]);

    const rows = db.getDb().prepare('SELECT id, start_at FROM tasks ORDER BY id').all();

    expect(db.getDb().prepare("SELECT * FROM tasks WHERE id = 'jira'").get()).toEqual({
      ...legacy.find((row) => row.id === 'jira'),
      meet_url: null,
    });
    expect(rows).toEqual([
      { id: 'all-day', start_at: new Date(2026, 5, 2, 0, 0, 0, 0).getTime() },
      { id: 'already-set', start_at: 42 },
      { id: 'jira', start_at: null },
      { id: 'malformed', start_at: null },
      { id: 'timed', start_at: 1780309800000 },
    ]);
    expect(db.getDb().prepare("SELECT raw_json FROM tasks WHERE id = 'malformed'").get()).toEqual({
      raw_json: '{broken',
    });
  });

  it('backfills 007b meeting links from legacy calendar JSON', () => {
    seedLegacy([
      { id: 'hangout', raw_json: '{"hangoutLink":"https://meet.google.com/abc-defg-hij"}' },
      {
        id: 'conference',
        raw_json:
          '{"conferenceData":{"entryPoints":[{"entryPointType":"video","uri":"https://meet.google.com/xyz-abcd-efg"}]}}',
      },
      { id: 'malformed', raw_json: '{broken' },
      {
        id: 'jira',
        source: 'jira',
        raw_json: '{"hangoutLink":"https://meet.google.com/abc-defg-hij"}',
      },
    ]);

    const rows = db.getDb().prepare('SELECT id, meet_url FROM tasks ORDER BY id').all();

    expect(rows).toEqual([
      { id: 'conference', meet_url: 'https://meet.google.com/xyz-abcd-efg' },
      { id: 'hangout', meet_url: 'https://meet.google.com/abc-defg-hij' },
      { id: 'jira', meet_url: null },
      { id: 'malformed', meet_url: null },
    ]);
  });

  it('preserves pins and their task through rebuilds from pre-006', () => {
    seedLegacy([{ id: 'pinned', source: 'local' }]);
    const seed = new Database(DB_PATH);
    try {
      seed.exec(`${PINNED_SCHEMA};
        INSERT INTO pinned_tasks VALUES ('pinned', 'screen-a', 25, 75, 2345);
        INSERT INTO pinned_tasks VALUES ('pinned', 'screen-b', 80, 20, 3456);`);
      expect(seed.pragma('user_version', { simple: true })).toBe(0);
    } finally {
      seed.close();
    }

    const database = db.getDb();

    expect(database.prepare('SELECT * FROM pinned_tasks ORDER BY display_id').all()).toEqual([
      { task_id: 'pinned', display_id: 'screen-a', x_pct: 25, y_pct: 75, pinned_at: 2345 },
      { task_id: 'pinned', display_id: 'screen-b', x_pct: 80, y_pct: 20, pinned_at: 3456 },
    ]);
    expect(
      database.prepare("SELECT id, source, title, synced_at FROM tasks WHERE id = 'pinned'").get(),
    ).toEqual({ id: 'pinned', source: 'local', title: 'pinned', synced_at: 1234 });
    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.pragma('foreign_key_check')).toEqual([]);
    expect(readColumns(database)).toEqual(EXPECTED_COLUMNS);
  });
});

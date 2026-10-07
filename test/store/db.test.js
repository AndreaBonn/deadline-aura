const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');

const TEST_DB_DIR = path.join(os.tmpdir(), 'deadlineaura-test-' + process.pid);
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'db.sqlite');

let db;

function freshDb() {
  fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  const raw = new Database(TEST_DB_PATH);
  raw.pragma('journal_mode = WAL');

  const migrationSql = fs.readFileSync(
    path.join(__dirname, '..', '..', 'store', 'migrations', '001_initial.sql'),
    'utf-8',
  );
  raw.exec(migrationSql);
  return raw;
}

beforeEach(() => {
  db = freshDb();
});

afterEach(() => {
  if (db) {
    db.close();
  }
});

afterAll(() => {
  if (fs.existsSync(TEST_DB_DIR)) {
    fs.rmSync(TEST_DB_DIR, { recursive: true, force: true });
  }
});

function insertTask(overrides = {}) {
  const task = {
    id: 'test_1',
    source: 'gcal',
    title: 'Test Task',
    due_at: Date.now() + 24 * 3600000,
    priority: 3,
    is_done: 0,
    raw_json: '{}',
    synced_at: Date.now(),
    ...overrides,
  };

  db.prepare(
    `
    INSERT INTO tasks (id, source, title, due_at, priority, is_done, is_stale, raw_json, synced_at)
    VALUES (@id, @source, @title, @due_at, @priority, @is_done, 0, @raw_json, @synced_at)
  `,
  ).run(task);

  return task;
}

describe('database schema', () => {
  it('creates tasks table with correct columns', () => {
    const info = db.prepare("PRAGMA table_info('tasks')").all();
    const columns = info.map((c) => c.name);

    expect(columns).toContain('id');
    expect(columns).toContain('source');
    expect(columns).toContain('title');
    expect(columns).toContain('due_at');
    expect(columns).toContain('priority');
    expect(columns).toContain('is_done');
    expect(columns).toContain('is_stale');
    expect(columns).toContain('raw_json');
    expect(columns).toContain('synced_at');
    expect(columns).toContain('ai_stress');
    expect(columns).toContain('ai_category');
    expect(columns).toContain('ai_reasoning');
    expect(columns).toContain('ai_scored_at');
  });

  it('creates scores table', () => {
    const info = db.prepare("PRAGMA table_info('scores')").all();
    const columns = info.map((c) => c.name);

    expect(columns).toContain('id');
    expect(columns).toContain('global_score');
    expect(columns).toContain('computed_at');
  });

  it('creates ai_cache table', () => {
    const info = db.prepare("PRAGMA table_info('ai_cache')").all();
    const columns = info.map((c) => c.name);

    expect(columns).toContain('events_hash');
    expect(columns).toContain('response_json');
    expect(columns).toContain('computed_at');
  });

  it('enforces source CHECK constraint', () => {
    expect(() => {
      db.prepare(
        `
        INSERT INTO tasks (id, source, title, priority, is_done, is_stale, synced_at)
        VALUES ('x', 'invalid', 'Test', 3, 0, 0, ${Date.now()})
      `,
      ).run();
    }).toThrow();
  });

  it('enforces priority CHECK constraint', () => {
    expect(() => {
      db.prepare(
        `
        INSERT INTO tasks (id, source, title, priority, is_done, is_stale, synced_at)
        VALUES ('x', 'gcal', 'Test', 5, 0, 0, ${Date.now()})
      `,
      ).run();
    }).toThrow();
  });
});

describe('ai scoring columns', () => {
  it('enforces ai_category CHECK constraint', () => {
    insertTask({ id: 'ai_bad' });

    expect(() => {
      db.prepare("UPDATE tasks SET ai_category = 'invalid' WHERE id = ?").run('ai_bad');
    }).toThrow();
  });

  it('allows null AI fields for unscored tasks', () => {
    insertTask({ id: 'ai_null' });
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get('ai_null');

    expect(row.ai_stress).toBeNull();
    expect(row.ai_category).toBeNull();
    expect(row.ai_reasoning).toBeNull();
    expect(row.ai_scored_at).toBeNull();
  });
});

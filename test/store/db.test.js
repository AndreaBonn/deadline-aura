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

describe('task operations', () => {
  it('inserts and reads a task', () => {
    const task = insertTask();
    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get(task.id);

    expect(row.title).toBe('Test Task');
    expect(row.source).toBe('gcal');
    expect(row.priority).toBe(3);
    expect(row.is_done).toBe(0);
    expect(row.is_stale).toBe(0);
  });

  it('upserts task on conflict', () => {
    insertTask({ id: 'upsert_1', title: 'Original' });
    db.prepare(
      `
      INSERT INTO tasks (id, source, title, due_at, priority, is_done, is_stale, raw_json, synced_at)
      VALUES ('upsert_1', 'gcal', 'Updated', ${Date.now() + 3600000}, 2, 0, 0, '{}', ${Date.now()})
      ON CONFLICT(id) DO UPDATE SET title = excluded.title, priority = excluded.priority
    `,
    ).run();

    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get('upsert_1');
    expect(row.title).toBe('Updated');
    expect(row.priority).toBe(2);
  });

  it('soft deletes via is_stale flag', () => {
    insertTask({ id: 'stale_1' });
    db.prepare('UPDATE tasks SET is_stale = 1 WHERE id = ?').run('stale_1');

    const active = db.prepare('SELECT * FROM tasks WHERE is_stale = 0').all();
    expect(active.find((t) => t.id === 'stale_1')).toBeUndefined();
  });

  it('queries tasks within time window', () => {
    const now = Date.now();
    insertTask({ id: 'soon', due_at: now + 2 * 3600000 });
    insertTask({ id: 'far', due_at: now + 200 * 3600000 });
    insertTask({ id: 'no_due', due_at: null });

    const windowMs = 72 * 3600000;
    const results = db
      .prepare(
        `SELECT * FROM tasks
       WHERE is_done = 0 AND is_stale = 0
         AND (due_at IS NULL OR due_at <= ?)
       ORDER BY due_at ASC`,
      )
      .all(now + windowMs);

    const ids = results.map((r) => r.id);
    expect(ids).toContain('soon');
    expect(ids).toContain('no_due');
    expect(ids).not.toContain('far');
  });

  it('orders by due_at ASC with NULLs last', () => {
    const now = Date.now();
    insertTask({ id: 'later', due_at: now + 48 * 3600000 });
    insertTask({ id: 'sooner', due_at: now + 2 * 3600000 });
    insertTask({ id: 'no_due', due_at: null });

    const results = db
      .prepare(
        'SELECT * FROM tasks WHERE is_done = 0 AND is_stale = 0 ORDER BY due_at IS NULL, due_at ASC',
      )
      .all();

    expect(results[0].id).toBe('sooner');
    expect(results[1].id).toBe('later');
    expect(results[2].id).toBe('no_due');
  });
});

describe('scores operations', () => {
  it('inserts and retrieves global score', () => {
    const now = Date.now();
    db.prepare('INSERT INTO scores (global_score, computed_at) VALUES (?, ?)').run(0.73, now);

    const row = db.prepare('SELECT * FROM scores ORDER BY computed_at DESC LIMIT 1').get();
    expect(row.global_score).toBeCloseTo(0.73, 2);
    expect(row.computed_at).toBe(now);
  });

  it('returns latest score when multiple exist', () => {
    db.prepare('INSERT INTO scores (global_score, computed_at) VALUES (?, ?)').run(0.5, 1000);
    db.prepare('INSERT INTO scores (global_score, computed_at) VALUES (?, ?)').run(0.8, 2000);

    const row = db.prepare('SELECT * FROM scores ORDER BY computed_at DESC LIMIT 1').get();
    expect(row.global_score).toBeCloseTo(0.8, 2);
  });
});

describe('ai_cache operations', () => {
  it('inserts and retrieves cached AI response', () => {
    const hash = 'abc123';
    const response = '{"global_stress": 7}';
    const now = Date.now();

    db.prepare(
      'INSERT INTO ai_cache (events_hash, response_json, computed_at) VALUES (?, ?, ?)',
    ).run(hash, response, now);

    const row = db.prepare('SELECT * FROM ai_cache WHERE events_hash = ?').get(hash);
    expect(row.response_json).toBe(response);
  });

  it('replaces on conflict for same hash', () => {
    const hash = 'same_hash';
    db.prepare(
      'INSERT INTO ai_cache (events_hash, response_json, computed_at) VALUES (?, ?, ?)',
    ).run(hash, '{"old": true}', 1000);
    db.prepare(
      'INSERT OR REPLACE INTO ai_cache (events_hash, response_json, computed_at) VALUES (?, ?, ?)',
    ).run(hash, '{"new": true}', 2000);

    const row = db.prepare('SELECT * FROM ai_cache WHERE events_hash = ?').get(hash);
    expect(row.response_json).toBe('{"new": true}');
    expect(row.computed_at).toBe(2000);
  });
});

describe('ai scoring columns', () => {
  it('updates AI scores on existing task', () => {
    insertTask({ id: 'ai_1' });

    db.prepare(
      `UPDATE tasks SET ai_stress = ?, ai_category = ?, ai_reasoning = ?, ai_scored_at = ? WHERE id = ?`,
    ).run(8, 'work-critical', 'Tight deadline with client', Date.now(), 'ai_1');

    const row = db.prepare('SELECT * FROM tasks WHERE id = ?').get('ai_1');
    expect(row.ai_stress).toBe(8);
    expect(row.ai_category).toBe('work-critical');
    expect(row.ai_reasoning).toBe('Tight deadline with client');
  });

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

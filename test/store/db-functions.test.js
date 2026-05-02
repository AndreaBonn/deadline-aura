const path = require('path');
const fs = require('fs');
const os = require('os');

// Override DB path before requiring db module
const TEST_DB_DIR = path.join(os.tmpdir(), 'deadlineaura-fn-test-' + process.pid);
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'db.sqlite');

// Must mock before requiring db.js which reads DATA_DIR at module level
vi.spyOn(os, 'homedir').mockReturnValue(path.join(os.tmpdir(), 'deadlineaura-fn-test-home-' + process.pid));

// Now require db module — it will use the mocked homedir
const db = require('../../store/db');

afterAll(() => {
  db.close();
  // Clean up the temp directory
  const dataDir = path.join(os.tmpdir(), 'deadlineaura-fn-test-home-' + process.pid, '.local', 'share', 'deadlineaura');
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

const SAMPLE_TASK = {
  id: 'test_func_1',
  source: 'gcal',
  title: 'Functional Test Task',
  due_at: Date.now() + 24 * 3600000,
  priority: 3,
  is_done: 0,
  raw_json: '{"summary":"Test"}',
  synced_at: Date.now(),
};

describe('db module exported functions', () => {
  describe('getDb', () => {
    it('returns a database instance', () => {
      const database = db.getDb();
      expect(database).toBeDefined();
      expect(typeof database.prepare).toBe('function');
    });

    it('returns same instance on subsequent calls', () => {
      const db1 = db.getDb();
      const db2 = db.getDb();
      expect(db1).toBe(db2);
    });
  });

  describe('upsertTask', () => {
    it('inserts a new task', () => {
      db.upsertTask(SAMPLE_TASK);
      const row = db.getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(SAMPLE_TASK.id);
      expect(row.title).toBe('Functional Test Task');
      expect(row.source).toBe('gcal');
      expect(row.priority).toBe(3);
    });

    it('updates existing task on conflict', () => {
      db.upsertTask({ ...SAMPLE_TASK, title: 'Updated Title' });
      const row = db.getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(SAMPLE_TASK.id);
      expect(row.title).toBe('Updated Title');
    });
  });

  describe('getActiveTasks', () => {
    beforeEach(() => {
      db.getDb().prepare('DELETE FROM tasks').run();
    });

    it('returns active tasks within lookahead window', () => {
      db.upsertTask({ ...SAMPLE_TASK, id: 'active_1', due_at: Date.now() + 3600000 });
      db.upsertTask({ ...SAMPLE_TASK, id: 'far_away', due_at: Date.now() + 999 * 3600000 });

      const tasks = db.getActiveTasks(72 * 3600000);
      const ids = tasks.map((t) => t.id);
      expect(ids).toContain('active_1');
      expect(ids).not.toContain('far_away');
    });

    it('includes tasks without due_at', () => {
      db.upsertTask({ ...SAMPLE_TASK, id: 'no_due', due_at: null });
      const tasks = db.getActiveTasks(72 * 3600000);
      expect(tasks.find((t) => t.id === 'no_due')).toBeDefined();
    });

    it('excludes done tasks', () => {
      db.upsertTask({ ...SAMPLE_TASK, id: 'done_task', is_done: 1 });
      const tasks = db.getActiveTasks(72 * 3600000);
      expect(tasks.find((t) => t.id === 'done_task')).toBeUndefined();
    });

    it('excludes stale tasks', () => {
      db.upsertTask({ ...SAMPLE_TASK, id: 'stale_task' });
      db.getDb().prepare('UPDATE tasks SET is_stale = 1 WHERE id = ?').run('stale_task');
      const tasks = db.getActiveTasks(72 * 3600000);
      expect(tasks.find((t) => t.id === 'stale_task')).toBeUndefined();
    });
  });

  describe('markStale', () => {
    beforeEach(() => {
      db.getDb().prepare('DELETE FROM tasks').run();
    });

    it('marks tasks not in activeIds as stale', () => {
      db.upsertTask({ ...SAMPLE_TASK, id: 'keep' });
      db.upsertTask({ ...SAMPLE_TASK, id: 'remove' });

      db.markStale('gcal', ['keep']);

      const kept = db.getDb().prepare('SELECT is_stale FROM tasks WHERE id = ?').get('keep');
      const removed = db.getDb().prepare('SELECT is_stale FROM tasks WHERE id = ?').get('remove');

      expect(kept.is_stale).toBe(0);
      expect(removed.is_stale).toBe(1);
    });

    it('marks all tasks stale when activeIds is empty', () => {
      db.upsertTask({ ...SAMPLE_TASK, id: 'task_a' });
      db.upsertTask({ ...SAMPLE_TASK, id: 'task_b' });

      db.markStale('gcal', []);

      const tasks = db.getDb().prepare('SELECT * FROM tasks WHERE is_stale = 0').all();
      expect(tasks).toHaveLength(0);
    });
  });

  describe('updateAiScores', () => {
    beforeEach(() => {
      db.getDb().prepare('DELETE FROM tasks').run();
    });

    it('updates AI fields on existing task', () => {
      db.upsertTask({ ...SAMPLE_TASK, id: 'ai_task' });
      db.updateAiScores('ai_task', {
        stress: 8,
        category: 'work-critical',
        reasoning: 'Tight deadline',
      });

      const row = db.getDb().prepare('SELECT * FROM tasks WHERE id = ?').get('ai_task');
      expect(row.ai_stress).toBe(8);
      expect(row.ai_category).toBe('work-critical');
      expect(row.ai_reasoning).toBe('Tight deadline');
      expect(row.ai_scored_at).toBeGreaterThan(0);
    });
  });

  describe('saveGlobalScore / getLastGlobalScore', () => {
    it('saves and retrieves global score', () => {
      db.saveGlobalScore(0.73);
      const result = db.getLastGlobalScore();
      expect(result.global_score).toBeCloseTo(0.73, 2);
    });

    it('returns latest score when multiple exist', () => {
      db.saveGlobalScore(0.5);
      db.saveGlobalScore(0.9);
      const result = db.getLastGlobalScore();
      expect(result.global_score).toBeCloseTo(0.9, 2);
    });
  });

  describe('getAiCache / setAiCache', () => {
    it('stores and retrieves AI cache entry', () => {
      db.setAiCache('hash_123', '{"global_stress": 7}');
      const cached = db.getAiCache('hash_123');
      expect(cached.response_json).toBe('{"global_stress": 7}');
    });

    it('replaces on conflict (same hash)', () => {
      db.setAiCache('same_hash', '{"old": true}');
      db.setAiCache('same_hash', '{"new": true}');
      const cached = db.getAiCache('same_hash');
      expect(cached.response_json).toBe('{"new": true}');
    });

    it('returns undefined for non-existent hash', () => {
      const cached = db.getAiCache('non_existent_hash');
      expect(cached).toBeUndefined();
    });
  });

  describe('cleanupOldRecords', () => {
    beforeEach(() => {
      db.getDb().prepare('DELETE FROM tasks').run();
      db.getDb().prepare('DELETE FROM scores').run();
      db.getDb().prepare('DELETE FROM ai_cache').run();
    });

    it('removes old scores (older than 7 days)', () => {
      const oldTime = Date.now() - 8 * 24 * 3600000;
      db.getDb().prepare('INSERT INTO scores (global_score, computed_at) VALUES (?, ?)').run(0.5, oldTime);
      db.saveGlobalScore(0.8);

      db.cleanupOldRecords();

      const all = db.getDb().prepare('SELECT * FROM scores').all();
      expect(all).toHaveLength(1);
      expect(all[0].global_score).toBeCloseTo(0.8, 2);
    });

    it('removes stale tasks older than 48 hours', () => {
      const oldTime = Date.now() - 49 * 3600000;
      db.upsertTask({ ...SAMPLE_TASK, id: 'old_stale', synced_at: oldTime });
      db.getDb().prepare('UPDATE tasks SET is_stale = 1 WHERE id = ?').run('old_stale');

      db.cleanupOldRecords();

      const row = db.getDb().prepare('SELECT * FROM tasks WHERE id = ?').get('old_stale');
      expect(row).toBeUndefined();
    });

    it('removes old AI cache entries', () => {
      const oldTime = Date.now() - 8 * 24 * 3600000;
      db.getDb().prepare('INSERT INTO ai_cache (events_hash, response_json, computed_at) VALUES (?, ?, ?)').run('old_hash', '{}', oldTime);

      db.cleanupOldRecords();

      const cached = db.getAiCache('old_hash');
      expect(cached).toBeUndefined();
    });
  });

  describe('close', () => {
    it('closes and allows reopening', () => {
      db.close();
      // After close, getDb should create a new connection
      const newDb = db.getDb();
      expect(newDb).toBeDefined();
      expect(typeof newDb.prepare).toBe('function');
    });
  });
});

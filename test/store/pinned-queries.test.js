'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

vi.spyOn(os, 'homedir').mockReturnValue(
  path.join(os.tmpdir(), 'deadlineaura-pinned-test-home-' + process.pid),
);

const db = require('../../store/db');
const pinnedQueries = require('../../store/pinned-queries');

function insertBaseTask(id = 'task_1', overrides = {}) {
  db.upsertTask({
    id,
    source: 'gcal',
    title: 'Test Task',
    due_at: Date.now() + 24 * 3600000,
    priority: 3,
    is_done: 0,
    web_url: null,
    raw_json: '{}',
    synced_at: Date.now(),
    ...overrides,
  });
}

afterAll(() => {
  db.close();
  const dataDir = path.join(
    os.tmpdir(),
    'deadlineaura-pinned-test-home-' + process.pid,
    '.local',
    'share',
    'deadlineaura',
  );
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  db.getDb().prepare('DELETE FROM pinned_tasks').run();
  db.getDb().prepare('DELETE FROM tasks').run();
});

describe('pinned-queries', () => {
  describe('pinTask', () => {
    it('inserts a pinned task with default position 10,10', () => {
      insertBaseTask('t1');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });

      const row = db.getDb().prepare('SELECT * FROM pinned_tasks WHERE task_id = ?').get('t1');
      expect(row).toBeDefined();
      expect(row.x_pct).toBe(10.0);
      expect(row.y_pct).toBe(10.0);
      expect(row.display_id).toBe('eDP-1');
    });

    it('ignores duplicate pin (INSERT OR IGNORE)', () => {
      insertBaseTask('t1');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });

      const rows = db.getDb().prepare('SELECT * FROM pinned_tasks WHERE task_id = ?').all('t1');
      expect(rows).toHaveLength(1);
    });

    it('allows same task on different displays', () => {
      insertBaseTask('t1');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'HDMI-1' });

      const rows = db.getDb().prepare('SELECT * FROM pinned_tasks WHERE task_id = ?').all('t1');
      expect(rows).toHaveLength(2);
    });
  });

  describe('unpinTask', () => {
    it('removes the pin for a specific task and display', () => {
      insertBaseTask('t1');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });
      pinnedQueries.unpinTask({ taskId: 't1', displayId: 'eDP-1' });

      const row = db.getDb().prepare('SELECT * FROM pinned_tasks WHERE task_id = ?').get('t1');
      expect(row).toBeUndefined();
    });

    it('does not remove pin on other displays', () => {
      insertBaseTask('t1');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'HDMI-1' });
      pinnedQueries.unpinTask({ taskId: 't1', displayId: 'eDP-1' });

      const remaining = db
        .getDb()
        .prepare('SELECT * FROM pinned_tasks WHERE task_id = ?')
        .all('t1');
      expect(remaining).toHaveLength(1);
      expect(remaining[0].display_id).toBe('HDMI-1');
    });

    it('is a no-op when task is not pinned', () => {
      insertBaseTask('t1');
      expect(() => pinnedQueries.unpinTask({ taskId: 't1', displayId: 'eDP-1' })).not.toThrow();
    });
  });

  describe('unpinTaskFromAll', () => {
    it('removes all pins for a task across all displays', () => {
      insertBaseTask('t1');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'HDMI-1' });

      pinnedQueries.unpinTaskFromAll('t1');

      const rows = db.getDb().prepare('SELECT * FROM pinned_tasks WHERE task_id = ?').all('t1');
      expect(rows).toHaveLength(0);
    });

    it('does not affect other tasks', () => {
      insertBaseTask('t1');
      insertBaseTask('t2');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });
      pinnedQueries.pinTask({ taskId: 't2', displayId: 'eDP-1' });

      pinnedQueries.unpinTaskFromAll('t1');

      const remaining = db.getDb().prepare('SELECT * FROM pinned_tasks').all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].task_id).toBe('t2');
    });
  });

  describe('updatePosition', () => {
    it('updates x_pct and y_pct for a pinned task', () => {
      insertBaseTask('t1');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });
      pinnedQueries.updatePosition({ taskId: 't1', displayId: 'eDP-1', xPct: 55.5, yPct: 72.3 });

      const row = db
        .getDb()
        .prepare('SELECT x_pct, y_pct FROM pinned_tasks WHERE task_id = ?')
        .get('t1');
      expect(row.x_pct).toBeCloseTo(55.5);
      expect(row.y_pct).toBeCloseTo(72.3);
    });

    it('is a no-op when task is not pinned', () => {
      insertBaseTask('t1');
      expect(() =>
        pinnedQueries.updatePosition({ taskId: 't1', displayId: 'eDP-1', xPct: 50, yPct: 50 }),
      ).not.toThrow();
    });
  });

  describe('updatePositions', () => {
    it('updates multiple positions in a single transaction', () => {
      insertBaseTask('t1');
      insertBaseTask('t2');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });
      pinnedQueries.pinTask({ taskId: 't2', displayId: 'eDP-1' });

      pinnedQueries.updatePositions([
        { taskId: 't1', displayId: 'eDP-1', xPct: 20, yPct: 30 },
        { taskId: 't2', displayId: 'eDP-1', xPct: 80, yPct: 60 },
      ]);

      const r1 = db
        .getDb()
        .prepare('SELECT x_pct, y_pct FROM pinned_tasks WHERE task_id = ?')
        .get('t1');
      const r2 = db
        .getDb()
        .prepare('SELECT x_pct, y_pct FROM pinned_tasks WHERE task_id = ?')
        .get('t2');

      expect(r1.x_pct).toBeCloseTo(20);
      expect(r1.y_pct).toBeCloseTo(30);
      expect(r2.x_pct).toBeCloseTo(80);
      expect(r2.y_pct).toBeCloseTo(60);
    });

    it('handles empty array without throwing', () => {
      expect(() => pinnedQueries.updatePositions([])).not.toThrow();
    });
  });

  describe('isPinned', () => {
    it('returns true when task is pinned', () => {
      insertBaseTask('t1');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });
      expect(pinnedQueries.isPinned('t1')).toBe(true);
    });

    it('returns false when task is not pinned', () => {
      insertBaseTask('t1');
      expect(pinnedQueries.isPinned('t1')).toBe(false);
    });

    it('returns true when pinned on any display', () => {
      insertBaseTask('t1');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'HDMI-1' });
      expect(pinnedQueries.isPinned('t1')).toBe(true);
    });
  });

  describe('getByDisplay', () => {
    it('returns pinned tasks for a specific display with joined task data', () => {
      insertBaseTask('t1');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });

      const results = pinnedQueries.getByDisplay('eDP-1');
      expect(results).toHaveLength(1);
      expect(results[0].task_id).toBe('t1');
      expect(results[0].title).toBe('Test Task');
      expect(results[0].display_id).toBe('eDP-1');
    });

    it('returns empty array when no tasks pinned on display', () => {
      const results = pinnedQueries.getByDisplay('eDP-1');
      expect(results).toHaveLength(0);
    });

    it('does not return tasks pinned on other displays', () => {
      insertBaseTask('t1');
      insertBaseTask('t2');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });
      pinnedQueries.pinTask({ taskId: 't2', displayId: 'HDMI-1' });

      const results = pinnedQueries.getByDisplay('eDP-1');
      expect(results).toHaveLength(1);
      expect(results[0].task_id).toBe('t1');
    });

    it('returns results ordered by pinned_at ascending', () => {
      insertBaseTask('t1');
      insertBaseTask('t2');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });
      pinnedQueries.pinTask({ taskId: 't2', displayId: 'eDP-1' });

      const results = pinnedQueries.getByDisplay('eDP-1');
      expect(results[0].task_id).toBe('t1');
      expect(results[1].task_id).toBe('t2');
    });
  });

  describe('getAllPinned', () => {
    it('returns all pinned tasks across all displays', () => {
      insertBaseTask('t1');
      insertBaseTask('t2');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });
      pinnedQueries.pinTask({ taskId: 't2', displayId: 'HDMI-1' });

      const results = pinnedQueries.getAllPinned();
      expect(results).toHaveLength(2);
    });

    it('returns empty array when nothing is pinned', () => {
      const results = pinnedQueries.getAllPinned();
      expect(results).toHaveLength(0);
    });

    it('includes task fields from JOIN', () => {
      insertBaseTask('t1');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });

      const [result] = pinnedQueries.getAllPinned();
      expect(result).toHaveProperty('title');
      expect(result).toHaveProperty('source');
      expect(result).toHaveProperty('due_at');
      expect(result).toHaveProperty('priority');
    });

    it('includes stale tasks with is_stale flag', () => {
      insertBaseTask('t1');
      insertBaseTask('t2');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });
      pinnedQueries.pinTask({ taskId: 't2', displayId: 'eDP-1' });

      db.getDb().prepare('UPDATE tasks SET is_stale = 1 WHERE id = ?').run('t1');

      const results = pinnedQueries.getAllPinned();
      expect(results).toHaveLength(2);
      const staleTask = results.find((r) => r.task_id === 't1');
      const activeTask = results.find((r) => r.task_id === 't2');
      expect(staleTask.is_stale).toBe(1);
      expect(activeTask.is_stale).toBe(0);
    });
  });

  describe('getByDisplay — stale tasks included', () => {
    it('includes stale tasks with is_stale flag in display results', () => {
      insertBaseTask('t1');
      insertBaseTask('t2');
      pinnedQueries.pinTask({ taskId: 't1', displayId: 'eDP-1' });
      pinnedQueries.pinTask({ taskId: 't2', displayId: 'eDP-1' });

      db.getDb().prepare('UPDATE tasks SET is_stale = 1 WHERE id = ?').run('t1');

      const results = pinnedQueries.getByDisplay('eDP-1');
      expect(results).toHaveLength(2);
      const staleTask = results.find((r) => r.task_id === 't1');
      expect(staleTask.is_stale).toBe(1);
    });
  });
});

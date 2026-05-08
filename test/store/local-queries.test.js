'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

vi.spyOn(os, 'homedir').mockReturnValue(
  path.join(os.tmpdir(), 'deadlineaura-local-test-home-' + process.pid),
);

const db = require('../../store/db');
const localQueries = require('../../store/local-queries');
const pinnedQueries = require('../../store/pinned-queries');

afterAll(() => {
  db.close();
  const dataDir = path.join(
    os.tmpdir(),
    'deadlineaura-local-test-home-' + process.pid,
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

describe('local-queries', () => {
  describe('createLocalTask', () => {
    it('creates a task with source local and returns id', () => {
      const id = localQueries.createLocalTask({
        title: 'Pagare bolletta',
        dueAt: Date.now() + 86400000,
        priority: 2,
      });

      expect(id).toMatch(/^local_\d+_[a-f0-9]{8}$/);

      const row = db.getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      expect(row.source).toBe('local');
      expect(row.title).toBe('Pagare bolletta');
      expect(row.priority).toBe(2);
      expect(row.is_done).toBe(0);
      expect(row.is_stale).toBe(0);
    });

    it('creates task without due date', () => {
      const id = localQueries.createLocalTask({
        title: 'Idea per progetto',
      });

      const row = db.getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      expect(row.due_at).toBeNull();
      expect(row.priority).toBe(3);
    });

    it('generates unique ids across calls', () => {
      const id1 = localQueries.createLocalTask({ title: 'Task 1' });
      const id2 = localQueries.createLocalTask({ title: 'Task 2' });
      expect(id1).not.toBe(id2);
    });
  });

  describe('updateLocalTask', () => {
    it('updates title of a local task', () => {
      const id = localQueries.createLocalTask({ title: 'Vecchio titolo' });
      localQueries.updateLocalTask({ id, title: 'Nuovo titolo' });

      const row = db.getDb().prepare('SELECT title FROM tasks WHERE id = ?').get(id);
      expect(row.title).toBe('Nuovo titolo');
    });

    it('updates due_at and priority', () => {
      const id = localQueries.createLocalTask({ title: 'Test', priority: 3 });
      const newDue = Date.now() + 3600000;
      localQueries.updateLocalTask({ id, dueAt: newDue, priority: 1 });

      const row = db.getDb().prepare('SELECT due_at, priority FROM tasks WHERE id = ?').get(id);
      expect(row.due_at).toBe(newDue);
      expect(row.priority).toBe(1);
    });

    it('does not update non-local tasks', () => {
      db.upsertTask({
        id: 'jira_123',
        source: 'jira',
        title: 'Jira task',
        due_at: null,
        priority: 2,
        is_done: 0,
        web_url: null,
        raw_json: '{}',
        synced_at: Date.now(),
      });

      const result = localQueries.updateLocalTask({ id: 'jira_123', title: 'Hacked' });
      expect(result.changes).toBe(0);

      const row = db.getDb().prepare('SELECT title FROM tasks WHERE id = ?').get('jira_123');
      expect(row.title).toBe('Jira task');
    });

    it('returns changes=0 when no fields provided', () => {
      const id = localQueries.createLocalTask({ title: 'Test' });
      const result = localQueries.updateLocalTask({ id });
      expect(result.changes).toBe(0);
    });
  });

  describe('deleteLocalTask', () => {
    it('removes task and its pins', () => {
      const id = localQueries.createLocalTask({ title: 'Da eliminare' });
      pinnedQueries.pinTask({ taskId: id, displayId: 'eDP-1' });

      localQueries.deleteLocalTask(id);

      const task = db.getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id);
      expect(task).toBeUndefined();

      const pins = db.getDb().prepare('SELECT * FROM pinned_tasks WHERE task_id = ?').all(id);
      expect(pins).toHaveLength(0);
    });

    it('does not delete non-local tasks', () => {
      db.upsertTask({
        id: 'jira_safe',
        source: 'jira',
        title: 'Protected Jira task',
        due_at: null,
        priority: 2,
        is_done: 0,
        web_url: null,
        raw_json: '{}',
        synced_at: Date.now(),
      });

      localQueries.deleteLocalTask('jira_safe');

      const task = db.getDb().prepare('SELECT * FROM tasks WHERE id = ?').get('jira_safe');
      expect(task).toBeDefined();
    });
  });

  describe('completeLocalTask', () => {
    it('marks task as done and removes pins', () => {
      const id = localQueries.createLocalTask({ title: 'Da completare' });
      pinnedQueries.pinTask({ taskId: id, displayId: 'eDP-1' });

      localQueries.completeLocalTask(id);

      const task = db.getDb().prepare('SELECT is_done FROM tasks WHERE id = ?').get(id);
      expect(task.is_done).toBe(1);

      const pins = db.getDb().prepare('SELECT * FROM pinned_tasks WHERE task_id = ?').all(id);
      expect(pins).toHaveLength(0);
    });

    it('does not complete non-local tasks', () => {
      db.upsertTask({
        id: 'gcal_safe',
        source: 'gcal',
        title: 'Protected calendar event',
        due_at: null,
        priority: 3,
        is_done: 0,
        web_url: null,
        raw_json: '{}',
        synced_at: Date.now(),
      });

      localQueries.completeLocalTask('gcal_safe');

      const task = db.getDb().prepare('SELECT is_done FROM tasks WHERE id = ?').get('gcal_safe');
      expect(task.is_done).toBe(0);
    });
  });

  describe('getAllLocalTasks', () => {
    it('returns only active local tasks sorted by due_at', () => {
      const now = Date.now();
      localQueries.createLocalTask({ title: 'Later', dueAt: now + 86400000 });
      localQueries.createLocalTask({ title: 'Sooner', dueAt: now + 3600000 });
      localQueries.createLocalTask({ title: 'No date' });

      const tasks = localQueries.getAllLocalTasks();
      expect(tasks).toHaveLength(3);
      expect(tasks[0].title).toBe('Sooner');
      expect(tasks[1].title).toBe('Later');
      expect(tasks[2].title).toBe('No date');
    });

    it('excludes completed tasks', () => {
      const id = localQueries.createLocalTask({ title: 'Done task' });
      localQueries.completeLocalTask(id);

      const tasks = localQueries.getAllLocalTasks();
      expect(tasks).toHaveLength(0);
    });

    it('excludes non-local tasks', () => {
      localQueries.createLocalTask({ title: 'Local' });
      db.upsertTask({
        id: 'gcal_xyz',
        source: 'gcal',
        title: 'Calendar event',
        due_at: null,
        priority: 3,
        is_done: 0,
        web_url: null,
        raw_json: '{}',
        synced_at: Date.now(),
      });

      const tasks = localQueries.getAllLocalTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].source).toBe('local');
    });
  });

  describe('getActiveTasks includes local tasks', () => {
    it('returns local tasks alongside gcal/jira without lookahead limit', () => {
      const farFuture = Date.now() + 365 * 86400000;
      localQueries.createLocalTask({ title: 'Far future local', dueAt: farFuture });

      const tasks = db.getActiveTasks(3600000);
      const localTask = tasks.find((t) => t.source === 'local');
      expect(localTask).toBeDefined();
      expect(localTask.title).toBe('Far future local');
    });
  });
});

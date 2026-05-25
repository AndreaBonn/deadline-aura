const { normalizeTask, assignPriority } = require('../../integrations/google-tasks');

describe('google-tasks', () => {
  describe('assignPriority', () => {
    it('returns 2 for titles with high priority keywords', () => {
      expect(assignPriority('URGENT: fix login')).toBe(2);
      expect(assignPriority('Deadline venerdì')).toBe(2);
      expect(assignPriority('Critico: deploy DB')).toBe(2);
      expect(assignPriority('ASAP review PR')).toBe(2);
      expect(assignPriority('Importante: chiamare cliente')).toBe(2);
    });

    it('returns 3 for normal titles', () => {
      expect(assignPriority('Comprare latte')).toBe(3);
      expect(assignPriority('Leggere documentazione')).toBe(3);
    });

    it('handles empty or missing title', () => {
      expect(assignPriority('')).toBe(3);
      expect(assignPriority(null)).toBe(3);
      expect(assignPriority(undefined)).toBe(3);
    });
  });

  describe('normalizeTask', () => {
    it('normalizes a task with due date', () => {
      const due = '2026-06-01T00:00:00.000Z';
      const task = {
        id: 'task123',
        title: 'Preparare presentazione',
        status: 'needsAction',
        due,
        webViewLink: 'https://tasks.google.com/task/123',
      };

      const result = normalizeTask(task);

      expect(result.id).toBe('gtasks_task123');
      expect(result.source).toBe('gtasks');
      expect(result.title).toBe('Preparare presentazione');
      expect(result.due_at).toBe(new Date(due).getTime());
      expect(result.start_at).toBeNull();
      expect(result.priority).toBe(3);
      expect(result.is_done).toBe(0);
      expect(result.web_url).toBe('https://tasks.google.com/task/123');
      expect(result.meet_url).toBeNull();
    });

    it('normalizes a task without due date as backlog', () => {
      const task = {
        id: 'task456',
        title: 'Idea per refactoring',
        status: 'needsAction',
      };

      const result = normalizeTask(task);

      expect(result.id).toBe('gtasks_task456');
      expect(result.due_at).toBeNull();
      expect(result.priority).toBe(3);
    });

    it('returns null for completed tasks', () => {
      const task = {
        id: 'task789',
        title: 'Done task',
        status: 'completed',
      };

      expect(normalizeTask(task)).toBeNull();
    });

    it('assigns high priority for urgent titles', () => {
      const task = {
        id: 'taskurg',
        title: 'URGENT: review contratto',
        status: 'needsAction',
      };

      const result = normalizeTask(task);
      expect(result.priority).toBe(2);
    });

    it('defaults title to (no title) when missing', () => {
      const task = {
        id: 'notitle',
        status: 'needsAction',
      };

      const result = normalizeTask(task);
      expect(result.title).toBe('(no title)');
    });

    it('stores raw JSON for debugging', () => {
      const task = {
        id: 'raw1',
        title: 'Test',
        status: 'needsAction',
      };

      const result = normalizeTask(task);
      const parsed = JSON.parse(result.raw_json);
      expect(parsed.id).toBe('raw1');
    });

    it('sets synced_at to current time', () => {
      const before = Date.now();
      const task = {
        id: 'sync1',
        title: 'Sync test',
        status: 'needsAction',
      };

      const result = normalizeTask(task);
      expect(result.synced_at).toBeGreaterThanOrEqual(before);
      expect(result.synced_at).toBeLessThanOrEqual(Date.now());
    });
  });
});

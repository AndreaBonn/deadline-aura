const { computeEventsHash } = require('../../core/sync-daemon');

describe('sync-daemon', () => {
  describe('computeEventsHash', () => {
    it('returns consistent hash for same tasks', () => {
      const tasks = [
        { id: '1', title: 'A', due_at: 1000, priority: 1 },
        { id: '2', title: 'B', due_at: 2000, priority: 2 },
      ];
      const h1 = computeEventsHash(tasks);
      const h2 = computeEventsHash(tasks);
      expect(h1).toBe(h2);
    });

    it('returns different hash for different tasks', () => {
      const t1 = [{ id: '1', title: 'A', due_at: 1000, priority: 1 }];
      const t2 = [{ id: '1', title: 'B', due_at: 1000, priority: 1 }];
      expect(computeEventsHash(t1)).not.toBe(computeEventsHash(t2));
    });

    it('is order-independent (sorted internally)', () => {
      const t1 = [
        { id: '1', title: 'A', due_at: 1000, priority: 1 },
        { id: '2', title: 'B', due_at: 2000, priority: 2 },
      ];
      const t2 = [
        { id: '2', title: 'B', due_at: 2000, priority: 2 },
        { id: '1', title: 'A', due_at: 1000, priority: 1 },
      ];
      expect(computeEventsHash(t1)).toBe(computeEventsHash(t2));
    });

    it('returns 64-char hex string (SHA-256)', () => {
      const hash = computeEventsHash([{ id: '1', title: 'X', due_at: 0, priority: 1 }]);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('empty array returns consistent hash', () => {
      const h1 = computeEventsHash([]);
      const h2 = computeEventsHash([]);
      expect(h1).toBe(h2);
      expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });

    it('different due_at produces different hash', () => {
      const t1 = [{ id: '1', title: 'A', due_at: 1000, priority: 1 }];
      const t2 = [{ id: '1', title: 'A', due_at: 2000, priority: 1 }];
      expect(computeEventsHash(t1)).not.toBe(computeEventsHash(t2));
    });

    it('different priority produces different hash', () => {
      const t1 = [{ id: '1', title: 'A', due_at: 1000, priority: 1 }];
      const t2 = [{ id: '1', title: 'A', due_at: 1000, priority: 2 }];
      expect(computeEventsHash(t1)).not.toBe(computeEventsHash(t2));
    });
  });
});

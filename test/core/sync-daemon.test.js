const { computeEventsHash, applyAiScores } = require('../../core/sync-daemon');
const db = require('../../store/db');

describe('sync-daemon', () => {
  describe('applyAiScores', () => {
    let updateAiScoresSpy;
    let saveGlobalScoreSpy;
    let warnSpy;

    beforeEach(() => {
      updateAiScoresSpy = vi.spyOn(db, 'updateAiScores').mockImplementation(() => {});
      saveGlobalScoreSpy = vi.spyOn(db, 'saveGlobalScore').mockImplementation(() => {});
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('maps 1-based AI index to correct taskId', () => {
      const activeTasks = [{ id: 'task-abc' }, { id: 'task-def' }];
      const aiResult = {
        per_event: [
          {
            id: 1,
            stress: 7,
            category: 'work-critical',
            reasoning: 'urgent',
            cognitive_type: 'analytical',
          },
          { id: 2, stress: 3, category: 'personal', reasoning: 'low', cognitive_type: 'passive' },
        ],
        global_stress: 6,
      };

      applyAiScores(aiResult, activeTasks);

      expect(updateAiScoresSpy).toHaveBeenCalledWith('task-abc', {
        stress: 7,
        category: 'work-critical',
        reasoning: 'urgent',
        cognitive_type: 'analytical',
      });
      expect(updateAiScoresSpy).toHaveBeenCalledWith('task-def', {
        stress: 3,
        category: 'personal',
        reasoning: 'low',
        cognitive_type: 'passive',
      });
      expect(saveGlobalScoreSpy).toHaveBeenCalledWith(0.6);
    });

    it('warns and skips when AI index is out of bounds', () => {
      const activeTasks = [{ id: 'task-only' }];
      const aiResult = {
        per_event: [
          {
            id: 1,
            stress: 5,
            category: 'admin',
            reasoning: 'ok',
            cognitive_type: 'administrative',
          },
          {
            id: 99,
            stress: 8,
            category: 'work-critical',
            reasoning: 'ghost',
            cognitive_type: 'analytical',
          },
        ],
      };

      applyAiScores(aiResult, activeTasks);

      expect(updateAiScoresSpy).toHaveBeenCalledTimes(1);
      expect(updateAiScoresSpy).toHaveBeenCalledWith('task-only', expect.any(Object));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('id=99'));
    });

    it('does nothing when aiResult is null', () => {
      applyAiScores(null, []);
      expect(updateAiScoresSpy).not.toHaveBeenCalled();
    });

    it('does nothing when per_event is missing', () => {
      applyAiScores({ global_stress: 5 }, []);
      expect(updateAiScoresSpy).not.toHaveBeenCalled();
      expect(saveGlobalScoreSpy).not.toHaveBeenCalled();
    });
  });

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

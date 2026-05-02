const { buildScoringPrompt, parseAiResponse } = require('../../ai/prompt');

describe('prompt branch coverage', () => {
  describe('buildScoringPrompt — raw_json branches', () => {
    it('includes start.dateTime when present', () => {
      const events = [
        {
          id: 'ev1',
          title: 'Meeting',
          source: 'gcal',
          raw_json: JSON.stringify({
            start: { dateTime: '2026-05-02T10:00:00Z' },
          }),
        },
      ];
      const prompt = buildScoringPrompt(events);
      expect(prompt).toContain('start: 2026-05-02T10:00:00Z');
    });

    it('uses start.date when dateTime is absent', () => {
      const events = [
        {
          id: 'ev1',
          title: 'All Day',
          source: 'gcal',
          raw_json: JSON.stringify({
            start: { date: '2026-05-02' },
          }),
        },
      ];
      const prompt = buildScoringPrompt(events);
      expect(prompt).toContain('start: 2026-05-02');
    });

    it('includes end.dateTime when present', () => {
      const events = [
        {
          id: 'ev1',
          title: 'Meeting',
          source: 'gcal',
          raw_json: JSON.stringify({
            end: { dateTime: '2026-05-02T11:00:00Z' },
          }),
        },
      ];
      const prompt = buildScoringPrompt(events);
      expect(prompt).toContain('end: 2026-05-02T11:00:00Z');
    });

    it('uses end.date when dateTime is absent', () => {
      const events = [
        {
          id: 'ev1',
          title: 'All Day',
          source: 'gcal',
          raw_json: JSON.stringify({
            end: { date: '2026-05-03' },
          }),
        },
      ];
      const prompt = buildScoringPrompt(events);
      expect(prompt).toContain('end: 2026-05-03');
    });

    it('includes organizer email', () => {
      const events = [
        {
          id: 'ev1',
          title: 'Meeting',
          source: 'gcal',
          raw_json: JSON.stringify({
            organizer: { email: 'boss@company.com' },
          }),
        },
      ];
      const prompt = buildScoringPrompt(events);
      expect(prompt).toContain('organizer: boss@company.com');
    });

    it('uses organizer displayName when email absent', () => {
      const events = [
        {
          id: 'ev1',
          title: 'Meeting',
          source: 'gcal',
          raw_json: JSON.stringify({
            organizer: { displayName: 'John Doe' },
          }),
        },
      ];
      const prompt = buildScoringPrompt(events);
      expect(prompt).toContain('organizer: John Doe');
    });

    it('truncates description to 200 chars', () => {
      const longDesc = 'a'.repeat(300);
      const events = [
        {
          id: 'ev1',
          title: 'Meeting',
          source: 'gcal',
          raw_json: JSON.stringify({ description: longDesc }),
        },
      ];
      const prompt = buildScoringPrompt(events);
      expect(prompt).toContain('desc: ' + 'a'.repeat(200));
      expect(prompt).not.toContain('a'.repeat(201));
    });

    it('handles unparseable raw_json gracefully', () => {
      const events = [
        {
          id: 'ev1',
          title: 'Test',
          source: 'gcal',
          raw_json: 'not json at all',
        },
      ];
      const prompt = buildScoringPrompt(events);
      expect(prompt).toContain('Test');
    });

    it('includes event without due_at', () => {
      const events = [{ id: 'ev1', title: 'No Due', source: 'gcal' }];
      const prompt = buildScoringPrompt(events);
      expect(prompt).toContain('No Due');
      expect(prompt).not.toContain('due:');
    });

    it('includes event without source', () => {
      const events = [{ id: 'ev1', title: 'No Source', due_at: Date.now() }];
      const prompt = buildScoringPrompt(events);
      expect(prompt).toContain('No Source');
      expect(prompt).not.toContain('source:');
    });
  });

  describe('parseAiResponse — edge cases', () => {
    it('handles response with extra whitespace', () => {
      const raw = '  \n  {"global_stress": 3}  \n  ';
      const result = parseAiResponse(raw);
      expect(result.global_stress).toBe(3);
    });

    it('handles multiple code fences', () => {
      const raw = '```json\n{"global_stress": 2}\n```\n';
      const result = parseAiResponse(raw);
      expect(result.global_stress).toBe(2);
    });

    it('defaults missing per_event stress to 5', () => {
      const raw = JSON.stringify({
        global_stress: 4,
        per_event: [
          { id: 1, category: 'work-routine', reasoning: 'test', cognitive_type: 'passive' },
        ],
      });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = parseAiResponse(raw);

      expect(result.per_event[0].stress).toBe(5);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing stress'));
      warnSpy.mockRestore();
    });
  });
});

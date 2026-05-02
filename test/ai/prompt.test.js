const { buildScoringPrompt, parseAiResponse } = require('../../ai/prompt');

describe('prompt', () => {
  describe('buildScoringPrompt', () => {
    it('includes all events in the prompt', () => {
      const events = [
        { id: 'ev1', title: 'Sprint Review', due_at: Date.now() + 3600000, source: 'gcal' },
        { id: 'ev2', title: 'AUTH-441 Fix login', due_at: Date.now() + 7200000, source: 'jira' },
      ];

      const prompt = buildScoringPrompt(events);

      expect(prompt).toContain('Sprint Review');
      expect(prompt).toContain('AUTH-441 Fix login');
      expect(prompt).toContain('cognitive load');
      expect(prompt.toLowerCase()).toContain('context switching');
    });

    it('includes raw_json details when available', () => {
      const events = [
        {
          id: 'ev1',
          title: 'Meeting',
          source: 'gcal',
          raw_json: JSON.stringify({
            description: 'Discuss Q3 roadmap',
            location: 'Room A',
            attendees: [{ email: 'a@b.com' }, { email: 'c@d.com' }],
          }),
        },
      ];

      const prompt = buildScoringPrompt(events);

      expect(prompt).toContain('Discuss Q3 roadmap');
      expect(prompt).toContain('Room A');
      expect(prompt).toContain('attendees: 2');
    });

    it('handles events without raw_json', () => {
      const events = [{ id: 'ev1', title: 'Simple event', source: 'gcal' }];
      const prompt = buildScoringPrompt(events);
      expect(prompt).toContain('Simple event');
    });
  });

  describe('parseAiResponse', () => {
    it('parses valid JSON response', () => {
      const raw = '{"global_stress": 7, "per_event": [], "daily_breakdown": []}';
      const result = parseAiResponse(raw);
      expect(result.global_stress).toBe(7);
    });

    it('strips markdown code fences', () => {
      const raw = '```json\n{"global_stress": 5}\n```';
      const result = parseAiResponse(raw);
      expect(result.global_stress).toBe(5);
    });

    it('throws on invalid JSON', () => {
      expect(() => parseAiResponse('not json')).toThrow();
    });
  });
});

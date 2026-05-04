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
      expect(prompt).toContain('clinical psychologist');
      expect(prompt.toLowerCase()).toContain('context switching');
    });

    it('includes calibration anchors', () => {
      const events = [{ id: 'ev1', title: 'Test', source: 'gcal' }];
      const prompt = buildScoringPrompt(events);

      expect(prompt).toContain('CALIBRATION ANCHORS');
      expect(prompt).toContain('1-2: Genuinely light');
      expect(prompt).toContain('9-10: Crushing');
    });

    it('requests clinical_note and patterns in JSON schema', () => {
      const events = [{ id: 'ev1', title: 'Test', source: 'gcal' }];
      const prompt = buildScoringPrompt(events);

      expect(prompt).toContain('clinical_note');
      expect(prompt).toContain('patterns');
      expect(prompt).toContain('cognitive_type');
      expect(prompt).toContain('decision_fatigue_risk');
      expect(prompt).toContain('recovery_adequacy');
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
    const validResponse = {
      global_stress: 7,
      daily_breakdown: [
        { date: '2026-05-03', stress: 6, peak_window: '10:00-12:00', reasoning: 'Dense morning' },
      ],
      per_event: [
        {
          id: 1,
          stress: 5,
          category: 'work-critical',
          cognitive_type: 'analytical',
          reasoning: 'Deep focus required',
        },
      ],
      cognitive_factors: {
        context_switching: 'high',
        fragmentation: 'medium',
        emotional_load: 'low',
        deep_work_ratio: 0.3,
        decision_fatigue_risk: 'medium',
        recovery_adequacy: 'marginal',
      },
      patterns: ['Back-to-back meetings 9:00-12:00 with no buffer'],
      clinical_note: 'Schedule lacks recovery windows between demanding blocks.',
    };

    it('parses valid JSON response with all fields', () => {
      const result = parseAiResponse(JSON.stringify(validResponse));
      expect(result.global_stress).toBe(7);
      expect(result.clinical_note).toContain('recovery windows');
      expect(result.patterns).toHaveLength(1);
      expect(result.per_event[0].cognitive_type).toBe('analytical');
      expect(result.cognitive_factors.decision_fatigue_risk).toBe('medium');
      expect(result.cognitive_factors.recovery_adequacy).toBe('marginal');
    });

    it('strips markdown code fences', () => {
      const raw = '```json\n{"global_stress": 5}\n```';
      const result = parseAiResponse(raw);
      expect(result.global_stress).toBe(5);
    });

    it('throws on invalid JSON', () => {
      expect(() => parseAiResponse('not json')).toThrow();
    });

    it('throws on missing global_stress', () => {
      expect(() => parseAiResponse('{"per_event": []}')).toThrow(
        'Missing or invalid global_stress',
      );
    });

    it('clamps global_stress to 1-10 range', () => {
      expect(parseAiResponse('{"global_stress": 15}').global_stress).toBe(10);
      expect(parseAiResponse('{"global_stress": -3}').global_stress).toBe(1);
      expect(parseAiResponse('{"global_stress": 5.7}').global_stress).toBe(6);
    });

    it('clamps per_event stress to 1-10 range', () => {
      const response = {
        global_stress: 5,
        per_event: [{ id: 1, stress: 12, category: 'admin', reasoning: 'test' }],
      };
      const result = parseAiResponse(JSON.stringify(response));
      expect(result.per_event[0].stress).toBe(10);
    });

    it('defaults invalid category to work-routine', () => {
      const response = {
        global_stress: 5,
        per_event: [{ id: 1, stress: 3, category: 'invalid-cat', reasoning: 'test' }],
      };
      const result = parseAiResponse(JSON.stringify(response));
      expect(result.per_event[0].category).toBe('work-routine');
    });

    it('defaults invalid cognitive_type to passive', () => {
      const response = {
        global_stress: 5,
        per_event: [
          { id: 1, stress: 3, category: 'admin', cognitive_type: 'unknown', reasoning: 'test' },
        ],
      };
      const result = parseAiResponse(JSON.stringify(response));
      expect(result.per_event[0].cognitive_type).toBe('passive');
    });

    it('defaults invalid cognitive_factors levels to medium', () => {
      const response = {
        global_stress: 5,
        cognitive_factors: {
          context_switching: 'extreme',
          fragmentation: 'low',
          emotional_load: 'high',
          deep_work_ratio: 0.5,
          decision_fatigue_risk: 'very-high',
          recovery_adequacy: 'bad',
        },
      };
      const result = parseAiResponse(JSON.stringify(response));
      expect(result.cognitive_factors.context_switching).toBe('medium');
      expect(result.cognitive_factors.fragmentation).toBe('low');
      expect(result.cognitive_factors.decision_fatigue_risk).toBe('medium');
      expect(result.cognitive_factors.recovery_adequacy).toBe('marginal');
    });

    it('clamps deep_work_ratio to 0-1', () => {
      const response = {
        global_stress: 5,
        cognitive_factors: { deep_work_ratio: 1.5 },
      };
      const result = parseAiResponse(JSON.stringify(response));
      expect(result.cognitive_factors.deep_work_ratio).toBe(1);
    });

    it('defaults missing patterns to empty array', () => {
      const result = parseAiResponse('{"global_stress": 3}');
      expect(result.patterns).toEqual([]);
    });

    it('defaults missing clinical_note to empty string', () => {
      const result = parseAiResponse('{"global_stress": 3}');
      expect(result.clinical_note).toBe('');
    });

    it('preserves valid patterns and clinical_note', () => {
      const response = {
        global_stress: 5,
        patterns: ['Pattern A', 'Pattern B'],
        clinical_note: 'Important observation',
      };
      const result = parseAiResponse(JSON.stringify(response));
      expect(result.patterns).toEqual(['Pattern A', 'Pattern B']);
      expect(result.clinical_note).toBe('Important observation');
    });
  });
});

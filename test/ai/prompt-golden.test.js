'use strict';

const fs = require('fs');
const path = require('path');
const { buildScoringPrompt, parseAiResponse } = require('../../ai/prompt');

const events = [
  {
    title: 'Away\nnow',
    source: 'gcal',
    due_at: '2026-11-21T10:00:00Z',
    raw_json: JSON.stringify({
      eventType: 'outOfOffice',
      transparency: 'transparent',
      start: { date: '2026-11-21' },
      end: { date: '2026-11-22' },
      description: 'x'.repeat(205),
      location: 'Office\nRome',
      organizer: { email: 'a@example.com', displayName: 'A' },
      attendees: [{}, {}],
    }),
  },
  {
    title: 'Meeting',
    source: 'outlook',
    raw_json: JSON.stringify({
      eventType: 'default',
      start: { dateTime: '2026-11-22T10:00:00Z' },
      end: { dateTime: '2026-11-22T11:00:00Z' },
      organizer: { displayName: 'Alex' },
    }),
  },
  { title: 'Issue', source: 'jira', raw_json: '{invalid' },
  { title: 'Task', source: 'local' },
];

function requiredModules(source) {
  return [...source.matchAll(/\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map((match) => match[1])
    .sort();
}

describe('prompt characterization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  for (const language of ['it', 'en']) {
    it(`matches the ${language} prompt golden`, () => {
      const expected = fs.readFileSync(
        path.join(__dirname, `../fixtures/prompt/scoring-prompt-${language}.txt`),
        'utf8',
      );
      expect(buildScoringPrompt(events, language)).toBe(expected);
    });
  }

  it('normalizes the complete response, including invalid fields and bounds', () => {
    const response = {
      global_stress: 15,
      per_event: [
        { id: 1, stress: 0, category: 'bad', cognitive_type: 'bad' },
        { id: 2, stress: 4.6 },
        { id: 3 },
      ],
      daily_breakdown: [{ stress: 12 }, { stress: 0 }, { stress: 4.6 }, {}],
      cognitive_factors: {
        context_switching: 'bad',
        fragmentation: 'bad',
        emotional_load: 'bad',
        decision_fatigue_risk: 'bad',
        recovery_adequacy: 'bad',
        deep_work_ratio: 1.4,
      },
      patterns: 'bad',
      clinical_note: 'Note',
    };
    expect(parseAiResponse(`\`\`\`json\n${JSON.stringify(response)}\n\`\`\``)).toEqual({
      global_stress: 10,
      per_event: [
        { id: 1, stress: 1, category: 'work-routine', cognitive_type: 'passive' },
        { id: 2, stress: 5 },
        { id: 3, stress: 5 },
      ],
      daily_breakdown: [{ stress: 10 }, { stress: 1 }, { stress: 5 }, {}],
      cognitive_factors: {
        context_switching: 'medium',
        fragmentation: 'medium',
        emotional_load: 'medium',
        decision_fatigue_risk: 'medium',
        recovery_adequacy: 'marginal',
        deep_work_ratio: 1,
      },
      patterns: [],
      note: 'Note',
    });
    expect(
      parseAiResponse(
        JSON.stringify({ global_stress: 0, cognitive_factors: { deep_work_ratio: -0.4 } }),
      ),
    ).toEqual({
      global_stress: 1,
      cognitive_factors: { deep_work_ratio: 0 },
      patterns: [],
      note: '',
    });
  });

  it.each([
    ['a missing global_stress', '{"per_event": []}'],
    ['a non-numeric global_stress', '{"global_stress": "7"}'],
  ])('rejects a response with %s', (_case, text) => {
    expect(() => parseAiResponse(text)).toThrow('Missing or invalid global_stress');
  });

  it('rejects a response that is not JSON', () => {
    expect(() => parseAiResponse('stress is 7')).toThrow(SyntaxError);
  });

  it('leaves non-array per_event and a null cognitive_factors untouched', () => {
    const parsed = parseAiResponse(
      '{"global_stress": 4, "per_event": "none", "cognitive_factors": null, "note": "ok"}',
    );

    expect(parsed).toEqual({
      global_stress: 4,
      per_event: 'none',
      cognitive_factors: null,
      patterns: [],
      note: 'ok',
    });
  });

  it('limits production dependencies and detects an added require', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../ai/prompt.js'), 'utf8');
    const allowed = ['../core/calendar-sources', 'crypto', 'fs'];
    expect(requiredModules(source)).toEqual(allowed);
    expect(requiredModules(`${source}\nrequire('extra');`)).not.toEqual(allowed);
  });
});

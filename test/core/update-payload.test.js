'use strict';

const { engineOptionsFromConfig, aiNotesFromCache } = require('../../core/update-payload');

describe('engineOptionsFromConfig', () => {
  it('maps config fields to deadline-engine options', () => {
    const config = {
      sync: { lookahead_hours: 48 },
      engine: { k_constant: 0.7, priority_weights: { high: 3, low: 1 } },
    };
    expect(engineOptionsFromConfig(config)).toEqual({
      lookaheadHours: 48,
      k: 0.7,
      priorityWeights: { high: 3, low: 1 },
    });
  });

  it('passes undefined for absent engine fields so engine defaults apply', () => {
    const options = engineOptionsFromConfig({ sync: { lookahead_hours: 24 }, engine: {} });
    expect(options).toEqual({ lookaheadHours: 24, k: undefined, priorityWeights: undefined });
  });

  it('throws on a config with no sync section (same as inline access)', () => {
    expect(() => engineOptionsFromConfig({ engine: {} })).toThrow(TypeError);
  });
});

describe('aiNotesFromCache', () => {
  it('prefers note over clinical_note', () => {
    const out = aiNotesFromCache({ note: 'N', clinical_note: 'C', daily_breakdown: [{ d: 1 }] });
    expect(out).toEqual({ clinicalNote: 'N', stressForecast: [{ d: 1 }] });
  });

  it('falls back to clinical_note when note is missing or empty', () => {
    expect(aiNotesFromCache({ clinical_note: 'C' }).clinicalNote).toBe('C');
    expect(aiNotesFromCache({ note: '', clinical_note: 'C' }).clinicalNote).toBe('C');
  });

  it.each([[null], [undefined], [{}], [{ note: '' }]])(
    'returns null note and empty forecast for %j',
    (input) => {
      expect(aiNotesFromCache(input)).toEqual({ clinicalNote: null, stressForecast: [] });
    },
  );

  it('defaults daily_breakdown to [] when null', () => {
    expect(aiNotesFromCache({ note: 'x', daily_breakdown: null }).stressForecast).toEqual([]);
  });
});

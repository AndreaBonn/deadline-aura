'use strict';

const {
  buildScoreBreakdownHtml,
  formatHoursRemaining,
} = require('../../renderer/sidebar-score-breakdown');
const { escapeHtml } = require('../../renderer/sidebar-utils');
const t = (key, params = {}) => key + (params.n === undefined ? '' : ` ${params.n}`);
const attack = '<img src=x onerror=1>';

function payload() {
  return {
    breakdown: {
      ai: { fresh: true, global_stress: 7, reasoning: 'Reasoning', note: 'Note' },
      mechanical: {
        score: 0.4,
        reason_key: 'deadlines',
        volume_amp_applied: false,
        ooo_filtered_count: 0,
      },
      blend: { ai_weight: 0.6, mechanical_weight: 0.4 },
      global_score: 0.58,
      top_drivers: [
        {
          title: 'Résumé 東京',
          source: 'jira',
          hours_remaining: 5,
          ai_stress: 7,
          urgency_score: 0.8,
          web_url: 'https://example.com/?a="b',
        },
      ],
    },
  };
}

describe('score breakdown HTML', () => {
  it.each([
    [-1, 'postit.expired'],
    [0.5, '30m'],
    [5, '5h'],
    [48, '2countdown.days_short'],
    [null, '\u2014'],
    [undefined, '\u2014'],
    [0.999, '1h'],
  ])('formats %s hours', (hours, expected) => {
    expect(formatHoursRemaining(hours, t)).toBe(expected);
  });

  it('renders concrete scores, source, title and a quoted URL', () => {
    const html = buildScoreBreakdownHtml(payload(), t);
    for (const value of [
      'Résumé 東京',
      'sidebar.jira',
      '80%',
      '7/10 × 60%',
      '0.40',
      '0.58',
      '&quot;b',
    ]) {
      expect(html).toContain(value);
    }
  });

  it('pairs a stale warning without AI formula with fresh formula without warning', () => {
    const data = payload();
    const fresh = buildScoreBreakdownHtml(data, t);
    data.breakdown.ai.fresh = false;
    const stale = buildScoreBreakdownHtml(data, t);
    expect(stale).toContain('score_breakdown.ai_stale');
    expect(stale).not.toContain('7/10 × 60%');
    expect(fresh).toContain('7/10 × 60%');
    expect(fresh).not.toContain('score_breakdown.ai_stale');
  });

  it.each([null, {}])('renders unavailable for %s', (data) => {
    expect(buildScoreBreakdownHtml(data, t)).toContain('score_breakdown.unavailable');
  });

  it('renders absent AI and drivers, volume amplification and filtered events', () => {
    const data = payload();
    data.breakdown.ai = null;
    data.breakdown.top_drivers = [];
    data.breakdown.mechanical.volume_amp_applied = true;
    data.breakdown.mechanical.ooo_filtered_count = 3;
    const html = buildScoreBreakdownHtml(data, t);
    expect(html).toContain('score_breakdown.ai_unavailable');
    expect(html).toContain('score_breakdown.volume_amp_yes');
    expect(html).toContain('>3</span>');
    delete data.breakdown.top_drivers;
    expect(buildScoreBreakdownHtml(data, t)).toContain('score_breakdown.why_title');
  });

  it.each(['title', 'source', 'ai_stress', 'web_url'])('escapes untrusted driver %s', (field) => {
    const data = payload();
    data.breakdown.top_drivers[0][field] = attack;
    const html = buildScoreBreakdownHtml(data, t);
    expect(html).toContain(escapeHtml(attack));
    expect(html).not.toContain(attack);
  });

  it('escapes AI values and translated mechanical reasoning before innerHTML', () => {
    const data = payload();
    data.breakdown.ai.global_stress = attack;
    data.breakdown.ai.reasoning = attack;
    data.breakdown.ai.note = attack;
    const translate = (key) => (key.startsWith('score_breakdown.reason_') ? attack : t(key));
    const html = buildScoreBreakdownHtml(data, translate);
    expect(html).toContain(escapeHtml(attack));
    expect(html).not.toContain(attack);
  });

  it.each(['reasoning', 'note'])(
    'does not interpolate the unused AI %s field into HTML',
    (field) => {
      const data = payload();
      const expected = buildScoreBreakdownHtml(data, t);
      data.breakdown.ai[field] = attack;
      const html = buildScoreBreakdownHtml(data, t);
      expect(html).toBe(expected);
      expect(html).toContain('Résumé 東京');
      expect(html).not.toContain(attack);
    },
  );

  it('preserves long unicode titles and handles missing optional driver fields', () => {
    const data = payload();
    const driver = data.breakdown.top_drivers[0];
    driver.title = 'è東京'.repeat(2000);
    driver.source = 'custom';
    driver.ai_stress = null;
    driver.hours_remaining = null;
    driver.web_url = null;
    expect(buildScoreBreakdownHtml(data, t)).toContain(driver.title);
    driver.title = null;
    expect(buildScoreBreakdownHtml(data, t)).toContain('title=""');
  });
});

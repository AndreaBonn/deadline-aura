'use strict';

const { buildForecastColumns, stressToColor } = require('../../renderer/sidebar-ai-panel');

describe('forecast columns', () => {
  const options = { todayKey: '2026-10-19', locale: 'en-US' };
  it.each([null, undefined, []])('returns no columns for %j', (daily) => {
    expect(buildForecastColumns(daily, options)).toEqual([]);
  });
  it('keeps five days, local weekday labels, raw percentages and optional titles', () => {
    const daily = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-10-${19 + i}`,
      stress: i + 1,
    }));
    daily[0].reasoning = '<img src=x onerror=1> & "東京"';
    const before = JSON.stringify(daily);
    const columns = buildForecastColumns(daily, options);
    expect(columns).toHaveLength(5);
    expect(columns[0]).toEqual({
      label: 'Mon',
      value: '10%',
      color: 'hsl(144, 38%, 32%)',
      isToday: true,
      title: daily[0].reasoning,
    });
    expect(columns[1]).toEqual({
      label: 'Tue',
      value: '20%',
      color: 'hsl(128, 40%, 33%)',
      isToday: false,
    });
    expect(columns[4].label).toBe('Fri');
    expect(JSON.stringify(daily)).toBe(before);
  });
  it('uses local midnight for DST dates and falls back from untranslated locale keys', () => {
    expect(
      buildForecastColumns([{ date: '2026-03-08', stress: 12, reasoning: '' }], {
        todayKey: '2026-03-09',
        locale: 'meta.dateLocale',
      }),
    ).toEqual([
      {
        label: 'dom',
        value: '120%',
        color: 'hsl(0, 60%, 45%)',
        isToday: false,
      },
    ]);
  });
});

it.each([
  [0, 'hsl(160, 35%, 30%)'],
  [-1, 'hsl(160, 35%, 30%)'],
  [10, 'hsl(0, 60%, 45%)'],
  [12, 'hsl(0, 60%, 45%)'],
])('maps stress %i to %s', (stress, expected) => {
  expect(stressToColor(stress)).toBe(expected);
});

// @vitest-environment happy-dom
'use strict';

/* global document */

const {
  buildForecastColumns,
  stressToColor,
  renderStressForecast,
  renderClinicalNote,
  updateAiNotesToggle,
  initAiNotesToggle,
} = require('../../renderer/sidebar-ai-panel');

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

describe('AI panel DOM', () => {
  beforeEach(() => {
    vi.stubGlobal('_i18nReady', true);
    vi.stubGlobal('t', (key) => (key === 'meta.dateLocale' ? 'en-US' : key));
    document.body.innerHTML = `
      <p id="clinicalNote">old</p>
      <div id="stressForecast"><span>stale</span></div>
      <button id="aiNotesToggle" hidden aria-expanded="false"></button>
      <div id="aiNotesPanel"></div>`;
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('renders one column per day with value, label, today marker and reasoning title', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-19T10:00:00Z'));
    renderStressForecast([
      { date: '2026-10-19', stress: 5, reasoning: 'Deadline <b>Friday</b>' },
      { date: '2026-10-20', stress: 1 },
    ]);
    const container = document.getElementById('stressForecast');
    const cols = container.querySelectorAll('.forecast-col');
    expect(container.style.display).toBe('flex');
    expect(container.textContent).not.toContain('stale');
    expect(cols).toHaveLength(2);
    expect(cols[0].querySelector('.forecast-value').textContent).toBe('50%');
    expect(cols[0].querySelector('.forecast-label').textContent).toBe('Mon');
    expect(cols[0].classList.contains('forecast-today')).toBe(true);
    expect(cols[0].title).toBe('Deadline <b>Friday</b>');
    expect(cols[0].querySelector('b')).toBeNull();
    expect(cols[1].classList.contains('forecast-today')).toBe(false);
    expect(cols[1].title).toBe('');
  });

  it.each([null, undefined, []])('hides and empties the forecast for %j', (daily) => {
    renderStressForecast(daily);
    const container = document.getElementById('stressForecast');
    expect(container.style.display).toBe('none');
    expect(container.children).toHaveLength(0);
  });

  it('falls back to the Italian locale before i18n is ready', () => {
    vi.stubGlobal('_i18nReady', false);
    renderStressForecast([{ date: '2026-10-19', stress: 2 }]);
    expect(document.querySelector('.forecast-label').textContent).toBe('lun');
  });

  it('shows the clinical note as text and hides it when empty', () => {
    const el = document.getElementById('clinicalNote');
    renderClinicalNote('Rest <i>more</i>');
    expect(el.style.display).toBe('');
    expect(el.textContent).toBe('Rest <i>more</i>');
    expect(el.querySelector('i')).toBeNull();
    renderClinicalNote(null);
    expect(el.style.display).toBe('none');
  });

  it.each([
    [true, false, false],
    [false, true, false],
    [true, true, false],
    [false, false, true],
  ])('toggle visibility for note=%s forecast=%s is hidden=%s', (note, forecast, hidden) => {
    updateAiNotesToggle(note, forecast);
    expect(document.getElementById('aiNotesToggle').hidden).toBe(hidden);
  });

  it('expands and collapses the panel with aria-expanded following', () => {
    const btn = document.getElementById('aiNotesToggle');
    const panel = document.getElementById('aiNotesPanel');
    initAiNotesToggle();
    btn.click();
    expect(panel.classList.contains('expanded')).toBe(true);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    btn.click();
    expect(panel.classList.contains('expanded')).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('does nothing when the markup is missing', () => {
    document.body.innerHTML = '';
    expect(() => {
      renderStressForecast([{ date: '2026-10-19', stress: 2 }]);
      renderClinicalNote('x');
      updateAiNotesToggle(true, true);
      initAiNotesToggle();
    }).not.toThrow();
  });
});

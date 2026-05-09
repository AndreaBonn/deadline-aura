'use strict';

const { render } = require('../../core/wallpaper-renderer');

const SINGLE_DISPLAY = [{ id: 'eDP-1', width: 800, height: 600, x: 0, y: 0 }];
const LOW_PALETTE = { hsl: { h: 120, s: 30, l: 8 } };

describe('wallpaper-renderer — branch coverage', () => {
  it('renders overflow indicator when many events exceed available space', async () => {
    const now = Date.now();
    // Generate 25 events in the next 24h to trigger overflow
    const manyEvents = Array.from({ length: 25 }, (_, i) => ({
      id: `ev_${i}`,
      title: `Meeting ${i}`,
      start_at: now + (i + 1) * 600000,
      due_at: now + (i + 1) * 600000 + 1800000,
      source: i % 2 === 0 ? 'gcal' : 'jira',
      priority: 3,
    }));

    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.5,
      engineResult: { global_score: 0.5, tasks: [] },
      pinnedByDisplay: {},
      calendarEvents: manyEvents,
    });

    // Canvas should render without error
    const buf = canvas.toBuffer('image/png');
    expect(buf.length).toBeGreaterThan(0);
  });

  it('renders events with due_at but no start_at (falls back to due_at for filtering)', async () => {
    const now = Date.now();
    const events = [
      {
        id: 'due_only',
        title: 'Due-only event',
        start_at: null,
        due_at: now + 7200000,
        source: 'jira',
        priority: 2,
      },
    ];

    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.3,
      engineResult: null,
      pinnedByDisplay: {},
      calendarEvents: events,
    });

    expect(canvas.toBuffer('image/png').length).toBeGreaterThan(0);
  });

  it('skips events with no start_at and no due_at', async () => {
    const events = [
      { id: 'notime', title: 'No Time', start_at: null, due_at: null, source: 'gcal', priority: 3 },
    ];

    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.3,
      engineResult: null,
      pinnedByDisplay: {},
      calendarEvents: events,
    });

    // Should render without error (event filtered out)
    expect(canvas.toBuffer('image/png').length).toBeGreaterThan(0);
  });

  it('renders with calendarEvents=null (defaults to empty array)', async () => {
    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.3,
      engineResult: null,
      pinnedByDisplay: {},
      calendarEvents: null,
    });

    expect(canvas.toBuffer('image/png').length).toBeGreaterThan(0);
  });

  it('renders with undefined calendarEvents', async () => {
    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.3,
      engineResult: null,
      pinnedByDisplay: {},
    });

    expect(canvas.toBuffer('image/png').length).toBeGreaterThan(0);
  });

  it('renders long event title with truncation', async () => {
    const now = Date.now();
    const events = [
      {
        id: 'long_title',
        title: 'A'.repeat(200),
        start_at: now + 3600000,
        due_at: now + 7200000,
        source: 'gcal',
        priority: 3,
      },
    ];

    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.3,
      engineResult: { global_score: 0.3, tasks: [] },
      pinnedByDisplay: {},
      calendarEvents: events,
    });

    expect(canvas.toBuffer('image/png').length).toBeGreaterThan(0);
  });
});

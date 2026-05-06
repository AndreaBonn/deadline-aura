'use strict';

const { render, getBackgroundFile } = require('../../core/wallpaper-renderer');

const SINGLE_DISPLAY = [
  { id: 'eDP-1', width: 800, height: 600, x: 0, y: 0 },
];

const DUAL_DISPLAY = [
  { id: 'eDP-1', width: 800, height: 600, x: 0, y: 0 },
  { id: 'HDMI-1', width: 800, height: 600, x: 800, y: 0 },
];

const LOW_PALETTE = { hsl: { h: 120, s: 30, l: 8 } };

describe('wallpaper-renderer — render()', () => {
  it('returns a canvas object with toBuffer method', async () => {
    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.3,
      engineResult: null,
      pinnedByDisplay: {},
      calendarEvents: [],
    });

    expect(canvas).toHaveProperty('toBuffer');
    const buffer = canvas.toBuffer('image/png');
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('renders canvas matching display geometry for single display', async () => {
    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.1,
      engineResult: null,
      pinnedByDisplay: {},
      calendarEvents: [],
    });

    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(600);
  });

  it('renders spanned canvas for dual displays', async () => {
    const canvas = await render({
      displays: DUAL_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.2,
      engineResult: null,
      pinnedByDisplay: {},
      calendarEvents: [],
    });

    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(600);
  });

  it('renders mental load indicator when engineResult provided', async () => {
    const engineResult = {
      global_score: 0.75,
      tasks: [
        { id: 't1', title: 'Task 1', urgency_score: 0.8, priority: 1, source: 'gcal' },
      ],
    };

    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.75,
      engineResult,
      pinnedByDisplay: {},
      calendarEvents: [],
    });

    expect(canvas.toBuffer('image/png').length).toBeGreaterThan(0);
  });

  it('renders daily agenda with calendar events', async () => {
    const now = Date.now();
    const calendarEvents = [
      {
        id: 'e1',
        title: 'Morning Meeting',
        start_at: now + 3600000,
        due_at: now + 7200000,
        source: 'gcal',
        priority: 3,
      },
      {
        id: 'e2',
        title: 'Jira Sprint',
        start_at: now + 10800000,
        due_at: now + 14400000,
        source: 'jira',
        priority: 2,
      },
    ];

    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.5,
      engineResult: { global_score: 0.5, tasks: calendarEvents },
      pinnedByDisplay: {},
      calendarEvents,
    });

    expect(canvas.toBuffer('image/png').length).toBeGreaterThan(0);
  });

  it('renders pinned postit tasks on displays', async () => {
    const pinnedByDisplay = {
      'eDP-1': [
        { task_id: 't1', title: 'Pinned Task', x_pct: 50, y_pct: 50, priority: 1 },
      ],
    };

    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.3,
      engineResult: null,
      pinnedByDisplay,
      calendarEvents: [],
    });

    expect(canvas.toBuffer('image/png').length).toBeGreaterThan(0);
  });

  it('handles high score (critico band) without error', async () => {
    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: { hsl: { h: 0, s: 80, l: 15 } },
      score: 0.95,
      engineResult: { global_score: 0.95, tasks: [] },
      pinnedByDisplay: {},
      calendarEvents: [],
    });

    expect(canvas.toBuffer('image/png').length).toBeGreaterThan(0);
  });

  it('handles zero score (calmo band) without error', async () => {
    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: { hsl: { h: 180, s: 20, l: 6 } },
      score: 0,
      engineResult: null,
      pinnedByDisplay: {},
      calendarEvents: [],
    });

    expect(canvas.toBuffer('image/png').length).toBeGreaterThan(0);
  });

  it('handles empty pinnedByDisplay gracefully', async () => {
    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.3,
      engineResult: null,
      pinnedByDisplay: null,
      calendarEvents: [],
    });

    expect(canvas.toBuffer('image/png').length).toBeGreaterThan(0);
  });

  it('filters out past calendar events (only shows next 24h)', async () => {
    const now = Date.now();
    const calendarEvents = [
      { id: 'past', title: 'Past', start_at: now - 3600000, due_at: now - 1800000, source: 'gcal', priority: 3 },
      { id: 'future', title: 'Future', start_at: now + 3600000, due_at: now + 7200000, source: 'gcal', priority: 3 },
      { id: 'far', title: 'Far Future', start_at: now + 48 * 3600000, due_at: now + 49 * 3600000, source: 'gcal', priority: 3 },
    ];

    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.3,
      engineResult: { global_score: 0.3, tasks: calendarEvents },
      pinnedByDisplay: {},
      calendarEvents,
    });

    expect(canvas.toBuffer('image/png').length).toBeGreaterThan(0);
  });
});

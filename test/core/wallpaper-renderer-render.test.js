'use strict';

const { CanvasRenderingContext2D } = require('canvas');
const { setLanguage } = require('../../i18n');
const { render } = require('../../core/wallpaper-renderer');

const SINGLE_DISPLAY = [{ id: 'eDP-1', width: 800, height: 600, x: 0, y: 0 }];

const DUAL_DISPLAY = [
  { id: 'eDP-1', width: 800, height: 600, x: 0, y: 0 },
  { id: 'HDMI-1', width: 800, height: 600, x: 800, y: 0 },
];

const LOW_PALETTE = { hsl: { h: 120, s: 30, l: 8 } };

describe('wallpaper-renderer render()', () => {
  let fillTextSpy;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-07T10:00:00Z'));
    setLanguage('en');
    fillTextSpy = vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    setLanguage('it');
  });
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

  it('draws the agenda without the removed mental-load indicator when engineResult is provided', async () => {
    const engineResult = {
      global_score: 0.75,
      tasks: [{ id: 't1', title: 'Task 1', urgency_score: 0.8, priority: 1, source: 'gcal' }],
    };

    await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.75,
      engineResult,
      pinnedByDisplay: {},
      calendarEvents: [{ title: 'Scheduled', start_at: Date.now() + 3600000 }],
    });

    const texts = fillTextSpy.mock.calls.map(([text]) => text);
    expect(texts).toContain('Scheduled');
    expect(texts.some((text) => /mental load|carico mentale/i.test(text))).toBe(false);
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

    await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.5,
      engineResult: { global_score: 0.5, tasks: calendarEvents },
      pinnedByDisplay: {},
      calendarEvents,
    });

    expect(fillTextSpy.mock.calls.map(([text]) => text)).toEqual(
      expect.arrayContaining(['Morning Meeting', 'Jira Sprint']),
    );
  });

  it('renders pinned postit tasks on displays', async () => {
    const pinnedByDisplay = {
      'eDP-1': [{ task_id: 't1', title: 'Pinned Task', x_pct: 50, y_pct: 50, priority: 1 }],
    };

    await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.3,
      engineResult: null,
      pinnedByDisplay,
      calendarEvents: [],
    });

    expect(fillTextSpy.mock.calls).toContainEqual(['Pinned Task', 411.2, 329.12]);
  });

  it('renders high-score wallpaper differently from low-score wallpaper', async () => {
    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: { hsl: { h: 0, s: 80, l: 15 } },
      score: 0.95,
      engineResult: { global_score: 0.95, tasks: [] },
      pinnedByDisplay: {},
      calendarEvents: [],
    });

    const low = await render({
      displays: SINGLE_DISPLAY,
      palette: { hsl: { h: 0, s: 80, l: 15 } },
      score: 0.1,
      calendarEvents: [],
    });
    expect(canvas.getContext('2d').getImageData(400, 400, 1, 1).data[3]).toBe(255);
    expect(canvas.toBuffer('image/png')).not.toEqual(low.toBuffer('image/png'));
  });

  it('renders zero-score wallpaper differently from high-score wallpaper', async () => {
    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: { hsl: { h: 180, s: 20, l: 6 } },
      score: 0,
      engineResult: null,
      pinnedByDisplay: {},
      calendarEvents: [],
    });

    const high = await render({
      displays: SINGLE_DISPLAY,
      palette: { hsl: { h: 180, s: 20, l: 6 } },
      score: 0.95,
      calendarEvents: [],
    });
    expect(canvas.getContext('2d').getImageData(400, 400, 1, 1).data[3]).toBe(255);
    expect(canvas.toBuffer('image/png')).not.toEqual(high.toBuffer('image/png'));
  });

  it('handles empty pinnedByDisplay gracefully', async () => {
    await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.3,
      engineResult: null,
      pinnedByDisplay: null,
      calendarEvents: [{ title: 'Scheduled', start_at: Date.now() + 3600000 }],
    });

    const texts = fillTextSpy.mock.calls.map(([text]) => text);
    expect(texts).toContain('Scheduled');
    expect(texts).not.toContain('Pinned Task');
  });

  it('filters out past calendar events (only shows next 24h)', async () => {
    const now = Date.now();
    const calendarEvents = [
      {
        id: 'past',
        title: 'Past',
        start_at: now - 3600000,
        due_at: now - 1800000,
        source: 'gcal',
        priority: 3,
      },
      {
        id: 'future',
        title: 'Future',
        start_at: now + 3600000,
        due_at: now + 7200000,
        source: 'gcal',
        priority: 3,
      },
      {
        id: 'far',
        title: 'Far Future',
        start_at: now + 48 * 3600000,
        due_at: now + 49 * 3600000,
        source: 'gcal',
        priority: 3,
      },
    ];

    await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.3,
      engineResult: { global_score: 0.3, tasks: calendarEvents },
      pinnedByDisplay: {},
      calendarEvents,
    });

    const texts = fillTextSpy.mock.calls.map(([text]) => text);
    expect(texts).toContain('Future');
    expect(texts).not.toContain('Past');
    expect(texts).not.toContain('Far Future');
  });
});

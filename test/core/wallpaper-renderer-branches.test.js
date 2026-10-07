'use strict';

const { CanvasRenderingContext2D } = require('canvas');
const { render } = require('../../core/wallpaper-renderer');
const { setLanguage } = require('../../i18n');

const NOW_MS = new Date('2026-10-07T10:00:00Z').getTime();
const OPTIONS = {
  displays: [{ id: 'eDP-1', width: 800, height: 600, x: 0, y: 0 }],
  palette: { hsl: { h: 120, s: 30, l: 8 } },
  score: 0.3,
  pinnedByDisplay: {},
};

describe('wallpaper-renderer render agenda branches', () => {
  let fillTextSpy;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS);
    setLanguage('en');
    fillTextSpy = vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    setLanguage('it');
  });

  it('renders overflow indicator when many events exceed available space', async () => {
    const events = Array.from({ length: 25 }, (_, i) => ({
      title: `Meeting ${i}`,
      start_at: NOW_MS + (i + 1) * 600000,
      source: 'gcal',
    }));

    await render({ ...OPTIONS, calendarEvents: events });

    const texts = fillTextSpy.mock.calls.map(([text]) => text);
    // The 600px region fits 17 rows after margins, header and bottom clearance.
    expect(texts.filter((text) => text.startsWith('Meeting '))).toEqual(
      events.slice(0, 17).map(({ title }) => title),
    );
    expect(texts).toContain('+ 8 more');
  });

  it('renders events with due_at but no start_at', async () => {
    const event = { title: 'Due-only event', due_at: NOW_MS + 7200000, source: 'jira' };

    await render({ ...OPTIONS, calendarEvents: [event] });

    expect(fillTextSpy.mock.calls.map(([text]) => text)).toContain('Due-only event');
  });

  it('skips events with no start_at and no due_at', async () => {
    const events = [
      { title: 'No Time', start_at: null, due_at: null, source: 'gcal' },
      { title: 'Scheduled', start_at: NOW_MS + 3600000, source: 'gcal' },
    ];

    await render({ ...OPTIONS, calendarEvents: events });

    const texts = fillTextSpy.mock.calls.map(([text]) => text);
    expect(texts).toContain('Scheduled');
    expect(texts).not.toContain('No Time');
  });

  it.each([null, undefined])('renders an empty agenda for calendarEvents=%s', async (events) => {
    const pinnedByDisplay = {
      'eDP-1': [{ task_id: 'local_1', title: 'Pinned', x_pct: 50, y_pct: 50, priority: 3 }],
    };

    await render({ ...OPTIONS, pinnedByDisplay, calendarEvents: events });

    const texts = fillTextSpy.mock.calls.map(([text]) => text);
    expect(texts).toContain('Pinned');
    expect(texts).not.toContain('NEXT 24H');
  });

  it('renders long event title with truncation', async () => {
    const title = 'A'.repeat(200);

    await render({ ...OPTIONS, calendarEvents: [{ title, start_at: NOW_MS + 3600000 }] });

    const texts = fillTextSpy.mock.calls.map(([text]) => text);
    const drawnTitle = texts.find((text) => /^A+…$/.test(text));
    expect(drawnTitle).toBeDefined();
    expect(drawnTitle.length).toBeLessThan(title.length);
    expect(texts).not.toContain(title);
  });
});

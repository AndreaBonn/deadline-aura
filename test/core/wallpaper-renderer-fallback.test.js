'use strict';

const fs = require('fs');
const path = require('path');

// Mock fs.existsSync ONLY for background files to trigger drawFallbackGradient
const BACKGROUNDS_DIR = path.join(__dirname, '..', '..', 'assets', 'backgrounds');
const originalExistsSync = fs.existsSync.bind(fs);

vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
  if (typeof p === 'string' && p.startsWith(BACKGROUNDS_DIR)) {
    return false;
  }
  return originalExistsSync(p);
});

const { render } = require('../../core/wallpaper-renderer');

const SINGLE_DISPLAY = [{ id: 'eDP-1', width: 800, height: 600, x: 0, y: 0 }];

describe('wallpaper-renderer — fallback gradient (no background images)', () => {
  it('renders fallback gradient when no background file exists', async () => {
    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: { hsl: { h: 120, s: 30, l: 8 } },
      score: 0.3,
      engineResult: null,
      pinnedByDisplay: {},
      calendarEvents: [],
    });

    const buf = canvas.toBuffer('image/png');
    expect(buf.length).toBeGreaterThan(0);
  });

  it('renders fallback gradient with high score palette', async () => {
    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: { hsl: { h: 0, s: 80, l: 15 } },
      score: 0.95,
      engineResult: { global_score: 0.95, tasks: [] },
      pinnedByDisplay: {},
      calendarEvents: [],
    });

    const buf = canvas.toBuffer('image/png');
    expect(buf.length).toBeGreaterThan(0);
  });

  it('renders fallback on multi-display without background', async () => {
    const dualDisplay = [
      { id: 'eDP-1', width: 800, height: 600, x: 0, y: 0 },
      { id: 'HDMI-1', width: 800, height: 600, x: 800, y: 0 },
    ];

    const canvas = await render({
      displays: dualDisplay,
      palette: { hsl: { h: 200, s: 40, l: 10 } },
      score: 0.5,
      engineResult: null,
      pinnedByDisplay: {},
      calendarEvents: [],
    });

    expect(canvas.width).toBe(1600);
    expect(canvas.toBuffer('image/png').length).toBeGreaterThan(0);
  });

  it('renders agenda + fallback gradient + mental load together', async () => {
    const now = Date.now();
    const events = [
      {
        id: 'ev1',
        title: 'Meeting',
        start_at: now + 3600000,
        due_at: now + 7200000,
        source: 'gcal',
        priority: 3,
      },
    ];

    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: { hsl: { h: 60, s: 50, l: 12 } },
      score: 0.6,
      engineResult: { global_score: 0.6, tasks: events },
      pinnedByDisplay: {},
      calendarEvents: events,
    });

    expect(canvas.toBuffer('image/png').length).toBeGreaterThan(0);
  });
});

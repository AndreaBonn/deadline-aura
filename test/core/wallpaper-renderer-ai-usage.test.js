'use strict';

const { CanvasRenderingContext2D } = require('canvas');
const { render } = require('../../core/wallpaper-renderer');

const SINGLE_DISPLAY = [{ id: 'eDP-1', width: 1920, height: 1080, x: 0, y: 0 }];
const LOW_PALETTE = { hsl: { h: 120, s: 30, l: 8 } };

const NOW_MS = new Date('2026-10-06T12:00:00.000Z').getTime();
const NOW_S = Math.floor(NOW_MS / 1000);

function claudeRow(label) {
  return {
    kind: 'claude',
    label,
    available: true,
    stale: false,
    capturedAt: NOW_S - 60,
    fiveHour: { pct: 23, resetsAt: NOW_S + 7200, inferred: false, expired: false },
    sevenDay: { pct: 41, resetsAt: NOW_S + 3 * 86400, inferred: false, expired: false },
  };
}

describe('wallpaper-renderer — AI usage band integration', () => {
  it('draws the usage band when usageRows is non-empty', async () => {
    const withoutRows = await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.3,
      engineResult: null,
      pinnedByDisplay: {},
      calendarEvents: [],
      usageRows: [],
      nowMs: NOW_MS,
    });
    const withRows = await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.3,
      engineResult: null,
      pinnedByDisplay: {},
      calendarEvents: [],
      usageRows: [claudeRow('delivery')],
      nowMs: NOW_MS,
    });

    expect(withoutRows.toBuffer('image/png')).not.toEqual(withRows.toBuffer('image/png'));
  });

  it('draws real band text (positive) and never the removed mental-load wording (negative)', async () => {
    const fillTextSpy = vi.spyOn(CanvasRenderingContext2D.prototype, 'fillText');

    await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.3,
      engineResult: { global_score: 0.3, tasks: [] },
      pinnedByDisplay: {},
      calendarEvents: [],
      usageRows: [claudeRow('delivery')],
      nowMs: NOW_MS,
    });

    const texts = fillTextSpy.mock.calls.map((call) => call[0]);
    fillTextSpy.mockRestore();

    expect(texts.some((txt) => txt.includes('23%'))).toBe(true);
    expect(texts.some((txt) => /carico mentale|mental load/i.test(txt))).toBe(false);
  });

  it('keeps the background tint different between a low and a high score', async () => {
    const low = await render({
      displays: SINGLE_DISPLAY,
      palette: { hsl: { h: 120, s: 30, l: 8 } },
      score: 0.2,
      engineResult: null,
      pinnedByDisplay: {},
      calendarEvents: [],
      usageRows: [],
      nowMs: NOW_MS,
    });
    const high = await render({
      displays: SINGLE_DISPLAY,
      palette: { hsl: { h: 0, s: 80, l: 15 } },
      score: 0.9,
      engineResult: null,
      pinnedByDisplay: {},
      calendarEvents: [],
      usageRows: [],
      nowMs: NOW_MS,
    });

    expect(low.toBuffer('image/png')).not.toEqual(high.toBuffer('image/png'));
  });

  it('defaults usageRows to an empty array and nowMs to Date.now() when omitted', async () => {
    const canvas = await render({
      displays: SINGLE_DISPLAY,
      palette: LOW_PALETTE,
      score: 0.3,
      engineResult: null,
      pinnedByDisplay: {},
      calendarEvents: [],
    });

    expect(canvas.toBuffer('image/png').length).toBeGreaterThan(0);
  });
});

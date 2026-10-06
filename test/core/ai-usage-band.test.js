'use strict';

const { createCanvas } = require('canvas');
const { bandHeight, bandTop, drawUsageBand } = require('../../core/ai-usage-band');
const { formatReset } = require('../../core/ai-usage-format');

const NOW_MS = new Date('2026-10-06T12:00:00.000Z').getTime();
const NOW_S = Math.floor(NOW_MS / 1000);

const WIDE_REGION = { displayId: 'd1', x: 0, y: 0, width: 1920, height: 1080 };
const NARROW_REGION = { displayId: 'd1', x: 0, y: 0, width: 1366, height: 768 };

function claudeRow(label, overrides = {}) {
  return {
    kind: 'claude',
    label,
    available: true,
    stale: false,
    capturedAt: NOW_S - 60,
    fiveHour: { pct: 23, resetsAt: NOW_S + 2 * 3600, inferred: false, expired: false },
    sevenDay: { pct: 41, resetsAt: NOW_S + 3 * 86400, inferred: false, expired: false },
    ...overrides,
  };
}

const FIVE_ROWS = [
  claudeRow('alpha'),
  claudeRow('beta'),
  claudeRow('gamma'),
  claudeRow('delta'),
  claudeRow('epsilon'),
];

function newCtx(region) {
  const canvas = createCanvas(region.width, region.height);
  return { canvas, ctx: canvas.getContext('2d') };
}

describe('core/ai-usage-band — bandHeight / bandTop', () => {
  it('returns 0 height for an empty row set', () => {
    expect(bandHeight([], WIDE_REGION)).toBe(0);
  });

  it('grows with the number of rows once cards wrap onto more card-rows', () => {
    const one = bandHeight([claudeRow('a')], NARROW_REGION);
    const five = bandHeight(FIVE_ROWS, NARROW_REGION);
    expect(five).toBeGreaterThan(one);
  });

  it('is taller on a narrow region than a wide one for the same rows (more wrapped card-rows)', () => {
    const wide = bandHeight(FIVE_ROWS, WIDE_REGION);
    const narrow = bandHeight(FIVE_ROWS, NARROW_REGION);
    expect(narrow).toBeGreaterThan(wide);
  });

  it('bandTop sits at the region bottom when there are no rows', () => {
    expect(bandTop([], WIDE_REGION)).toBe(WIDE_REGION.y + WIDE_REGION.height);
  });

  it('bandTop rises above the region bottom by exactly bandHeight', () => {
    const rows = [claudeRow('a')];
    const height = bandHeight(rows, WIDE_REGION);
    expect(bandTop(rows, WIDE_REGION)).toBe(WIDE_REGION.y + WIDE_REGION.height - height);
  });
});

describe('core/ai-usage-band — drawUsageBand (real canvas)', () => {
  it('leaves the image pixels unchanged when rows is empty', () => {
    const { canvas, ctx } = newCtx(WIDE_REGION);
    ctx.fillStyle = '#123456';
    ctx.fillRect(0, 0, WIDE_REGION.width, WIDE_REGION.height);
    const before = ctx.getImageData(0, 0, WIDE_REGION.width, WIDE_REGION.height).data.slice();

    drawUsageBand(ctx, [], WIDE_REGION, { nowMs: NOW_MS, lang: 'it' });

    const after = ctx.getImageData(0, 0, WIDE_REGION.width, WIDE_REGION.height).data;
    expect(Buffer.from(after)).toEqual(Buffer.from(before));
    expect(canvas.width).toBe(WIDE_REGION.width);
  });

  it('changes pixels within the band area when one row is drawn', () => {
    const { ctx } = newCtx(WIDE_REGION);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, WIDE_REGION.width, WIDE_REGION.height);
    const before = ctx.getImageData(0, 0, WIDE_REGION.width, WIDE_REGION.height).data.slice();

    drawUsageBand(ctx, [claudeRow('delivery')], WIDE_REGION, { nowMs: NOW_MS, lang: 'it' });

    const after = ctx.getImageData(0, 0, WIDE_REGION.width, WIDE_REGION.height).data;
    expect(Buffer.from(after)).not.toEqual(Buffer.from(before));
  });

  it('paints text pixels in the right half of the band when 4 cards fill the full width', () => {
    const { ctx } = newCtx(WIDE_REGION);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, WIDE_REGION.width, WIDE_REGION.height);

    const rows = [claudeRow('alpha'), claudeRow('beta'), claudeRow('gamma'), claudeRow('delta')];
    drawUsageBand(ctx, rows, WIDE_REGION, { nowMs: NOW_MS, lang: 'it' });

    const height = bandHeight(rows, WIDE_REGION);
    const top = bandTop(rows, WIDE_REGION);
    const halfWidth = Math.floor(WIDE_REGION.width / 2);
    const rightHalf = ctx.getImageData(halfWidth, top, WIDE_REGION.width - halfWidth, height).data;

    let nonVeilPixelFound = false;
    for (let i = 0; i < rightHalf.length; i += 4) {
      const [r, g, b] = [rightHalf[i], rightHalf[i + 1], rightHalf[i + 2]];
      // The veil is a uniform translucent black; text pixels are near-white.
      if (r > 100 || g > 100 || b > 100) {
        nonVeilPixelFound = true;
        break;
      }
    }
    expect(nonVeilPixelFound).toBe(true);
  });

  it('draws the percentage, the inferred-prefixed percentage, the formatted reset and n/a', () => {
    const { ctx } = newCtx(WIDE_REGION);
    const fillTextSpy = vi.spyOn(ctx, 'fillText');

    const rows = [
      claudeRow('delivery', {
        fiveHour: { pct: 23, resetsAt: NOW_S + 2 * 3600, inferred: false, expired: false },
        sevenDay: null,
      }),
      claudeRow('scouting', {
        fiveHour: { pct: 0, resetsAt: NOW_S - 10, inferred: true, expired: true },
        sevenDay: { pct: 41, resetsAt: NOW_S + 3 * 86400, inferred: false, expired: false },
      }),
    ];

    drawUsageBand(ctx, rows, WIDE_REGION, { nowMs: NOW_MS, lang: 'it' });

    const texts = fillTextSpy.mock.calls.map((call) => call[0]);
    expect(texts).toContain('23%');
    expect(texts).toContain('~0%');
    expect(texts).toContain(formatReset(NOW_S + 2 * 3600, NOW_MS, 'it'));
    expect(texts).toContain('n/d');
  });

  it('draws the free label instead of a reset for an expired window', () => {
    const { ctx } = newCtx(WIDE_REGION);
    const fillTextSpy = vi.spyOn(ctx, 'fillText');

    const rows = [
      claudeRow('scouting', {
        fiveHour: { pct: 0, resetsAt: NOW_S - 10, inferred: true, expired: true },
      }),
    ];

    drawUsageBand(ctx, rows, WIDE_REGION, { nowMs: NOW_MS, lang: 'it' });

    const texts = fillTextSpy.mock.calls.map((call) => call[0]);
    expect(texts).toContain('libera');
  });

  it('appends the updated-at suffix for a stale row', () => {
    const { ctx } = newCtx(WIDE_REGION);
    const fillTextSpy = vi.spyOn(ctx, 'fillText');

    const capturedAtMs = new Date('2026-10-06T11:05:00.000Z').getTime();
    const capturedAt = capturedAtMs / 1000;
    const rows = [claudeRow('delivery', { stale: true, capturedAt })];
    const expectedTime = `${String(new Date(capturedAtMs).getHours()).padStart(2, '0')}:${String(
      new Date(capturedAtMs).getMinutes(),
    ).padStart(2, '0')}`;

    drawUsageBand(ctx, rows, WIDE_REGION, { nowMs: NOW_MS, lang: 'it' });

    const texts = fillTextSpy.mock.calls.map((call) => call[0]);
    expect(texts.some((txt) => txt.includes(expectedTime))).toBe(true);
  });

  it('draws the codex label without a per-account suffix', () => {
    const { ctx } = newCtx(WIDE_REGION);
    const fillTextSpy = vi.spyOn(ctx, 'fillText');

    const rows = [{ ...claudeRow('codex'), kind: 'codex', label: 'codex' }];

    drawUsageBand(ctx, rows, WIDE_REGION, { nowMs: NOW_MS, lang: 'it' });

    const texts = fillTextSpy.mock.calls.map((call) => call[0]);
    expect(texts).toContain('CODEX');
    expect(texts).not.toContain('CODEX codex');
  });
});

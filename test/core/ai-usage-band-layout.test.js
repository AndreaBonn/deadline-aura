'use strict';

const { computeBandLayout } = require('../../core/ai-usage-band-layout');

const WIDE_REGION = { x: 0, width: 1920 };
const NARROW_REGION = { x: 0, width: 1366 };

describe('core/ai-usage-band-layout — computeBandLayout', () => {
  it('returns zero height and no cells for an empty row set', () => {
    const layout = computeBandLayout(0, WIDE_REGION);
    expect(layout.height).toBe(0);
    expect(layout.cells).toEqual([]);
  });

  it('lays out 4 rows on a 1920-wide region as a single file of 4 equal columns', () => {
    const layout = computeBandLayout(4, WIDE_REGION);

    expect(layout.rows).toBe(1);
    expect(layout.columns).toBe(4);

    const xs = layout.cells.map((cell) => cell.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size).toBe(4);

    const lastCell = layout.cells[layout.cells.length - 1];
    const rightEdge = lastCell.x + lastCell.width;
    expect(rightEdge).toBeGreaterThanOrEqual(WIDE_REGION.x + WIDE_REGION.width - 48 - 1);
    expect(rightEdge).toBeLessThanOrEqual(WIDE_REGION.x + WIDE_REGION.width - 48 + 1);
  });

  it('lays out 4 rows on a 1366-wide region as a single file (column stays >= 300)', () => {
    const layout = computeBandLayout(4, NARROW_REGION);

    expect(layout.rows).toBe(1);
    expect(layout.columnWidth).toBeGreaterThanOrEqual(300);
  });

  it('wraps 6 rows on a 1366-wide region onto 2 files of cards', () => {
    const layout = computeBandLayout(6, NARROW_REGION);

    expect(layout.rows).toBe(2);
    expect(layout.cells).toHaveLength(6);
  });

  it('lays out a single row as one column spanning the full band width', () => {
    const layout = computeBandLayout(1, WIDE_REGION);

    expect(layout.rows).toBe(1);
    expect(layout.columns).toBe(1);
    expect(layout.cells[0].width).toBe(WIDE_REGION.width - 48 * 2);
  });

  it('returns a height of 0 only for an empty row set', () => {
    expect(computeBandLayout(0, WIDE_REGION).height).toBe(0);
    expect(computeBandLayout(1, WIDE_REGION).height).toBeGreaterThan(0);
  });
});

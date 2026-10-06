'use strict';

const { createCanvas } = require('canvas');
const { truncateText } = require('../../core/canvas-text');

function ctxWithFont() {
  const canvas = createCanvas(200, 50);
  const ctx = canvas.getContext('2d');
  ctx.font = '400 12px "Ubuntu", system-ui, sans-serif';
  return ctx;
}

describe('core/canvas-text — truncateText', () => {
  it('returns the text unchanged when it fits within maxWidth', () => {
    const ctx = ctxWithFont();
    expect(truncateText(ctx, 'short', 1000)).toBe('short');
  });

  it('truncates with an ellipsis when the text exceeds maxWidth', () => {
    const ctx = ctxWithFont();
    const long = 'A'.repeat(200);
    const result = truncateText(ctx, long, 50);

    expect(result.endsWith('…')).toBe(true);
    expect(result.length).toBeLessThan(long.length);
    expect(ctx.measureText(result).width).toBeLessThanOrEqual(50);
  });

  it('returns just the ellipsis when maxWidth is too small for any character', () => {
    const ctx = ctxWithFont();
    const result = truncateText(ctx, 'hello', 1);
    expect(result).toBe('…');
  });
});

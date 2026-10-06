'use strict';

const ELLIPSIS = '…';

/**
 * Truncate text with a trailing ellipsis so it fits within maxWidth,
 * measured using the canvas context's currently active font.
 *
 * @param {CanvasRenderingContext2D} ctx - Canvas context (its font setting drives measurement).
 * @param {string} text - Text to fit.
 * @param {number} maxWidth - Maximum width, in pixels.
 * @returns {string} The original text, or a truncated version ending in an ellipsis.
 */
function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + ELLIPSIS).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + ELLIPSIS;
}

module.exports = { truncateText };

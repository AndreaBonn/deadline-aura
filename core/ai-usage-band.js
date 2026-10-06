'use strict';

const { drawCard, drawCardSeparator } = require('./ai-usage-card');
const { computeBandLayout, BAND_PADDING_Y, CARD_FILE_HEIGHT } = require('./ai-usage-band-layout');

const BAND_BG_COLOR = 'rgba(0, 0, 0, 0.35)';

/**
 * Height of the usage band for a given set of rows and region.
 * @param {object[]} rows - Usage rows.
 * @param {{width: number}} region - Display region.
 * @returns {number} Band height, in pixels (0 for an empty row set).
 */
function bandHeight(rows, region) {
  return computeBandLayout(rows.length, region).height;
}

/**
 * Y coordinate of the band's top edge within a region.
 * @param {object[]} rows - Usage rows.
 * @param {{y: number, height: number, width: number}} region - Display region.
 * @returns {number} Absolute y coordinate.
 */
function bandTop(rows, region) {
  return region.y + region.height - bandHeight(rows, region);
}

/**
 * Fill the band's translucent background rectangle, full region width.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {{x: number, y: number, width: number, height: number}} region - Display region.
 * @param {number} height - Band height, in pixels.
 */
function drawBandBackground(ctx, region, height) {
  const top = region.y + region.height - height;
  ctx.fillStyle = BAND_BG_COLOR;
  ctx.fillRect(region.x, top, region.width, height);
}

/**
 * Draw the AI usage band across the full width of a region, anchored
 * to its bottom edge, as a grid of equal-width account cards. A no-op
 * when rows is empty.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {object[]} rows - Usage rows, as returned by collectUsage.
 * @param {{x: number, y: number, width: number, height: number}} region - Display region.
 * @param {{nowMs: number, lang: 'it'|'en'}} options - Current time and language.
 */
function drawUsageBand(ctx, rows, region, { nowMs, lang }) {
  const layout = computeBandLayout(rows.length, region);
  if (layout.height === 0) {
    return;
  }

  drawBandBackground(ctx, region, layout.height);

  const contentTop = region.y + region.height - layout.height + BAND_PADDING_Y;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  rows.forEach((row, i) => {
    const cell = layout.cells[i];
    const cellY = contentTop + cell.y;
    const colIndex = i % layout.columns;
    if (colIndex > 0) {
      drawCardSeparator(ctx, cell.x, cellY, CARD_FILE_HEIGHT);
    }
    drawCard(ctx, row, { ...cell, y: cellY }, { nowMs, lang });
  });
}

module.exports = { bandHeight, bandTop, drawUsageBand };

'use strict';

const BAND_MARGIN_X = 48;
const BAND_PADDING_Y = 16;
const MIN_COLUMN_WIDTH = 300;
const CARD_LABEL_LINE_HEIGHT = 20;
const CARD_VALUE_LINE_HEIGHT = 18;
const CARD_FILE_HEIGHT = CARD_LABEL_LINE_HEIGHT + CARD_VALUE_LINE_HEIGHT * 2;
const CARD_FILE_GAP = 10;

/**
 * Compute the geometry of the AI usage band: how many account cards fit
 * side by side before wrapping onto another row of cards ("fila"), and
 * the pixel rectangle of each card.
 *
 * Cards divide the available width (region.width minus the side margins)
 * equally. When the resulting column would fall below MIN_COLUMN_WIDTH,
 * cards wrap onto additional card-rows, always at equal width.
 *
 * @param {number} rowCount - Number of account rows to lay out.
 * @param {{x: number, width: number}} region - Display region (only x/width are used).
 * @returns {{columns: number, rows: number, columnWidth: number, height: number, cells: Array<{x: number, y: number, width: number}>}}
 *   `rows` is the number of card-rows (files of cards), not the account count.
 *   `cells[i].y` is relative to the band's own content top (0 at the first card-row).
 */
function computeBandLayout(rowCount, region) {
  if (rowCount === 0) {
    return { columns: 0, rows: 0, columnWidth: 0, height: 0, cells: [] };
  }

  const availableWidth = region.width - BAND_MARGIN_X * 2;
  const maxColumnsPerRow = Math.max(1, Math.floor(availableWidth / MIN_COLUMN_WIDTH));
  const columns = Math.min(maxColumnsPerRow, rowCount);
  const fileCount = Math.ceil(rowCount / columns);
  const columnWidth = availableWidth / columns;

  const cells = [];
  for (let i = 0; i < rowCount; i++) {
    const fileIndex = Math.floor(i / columns);
    const colIndex = i % columns;
    cells.push({
      x: region.x + BAND_MARGIN_X + colIndex * columnWidth,
      y: fileIndex * (CARD_FILE_HEIGHT + CARD_FILE_GAP),
      width: columnWidth,
    });
  }

  const height =
    BAND_PADDING_Y * 2 + fileCount * CARD_FILE_HEIGHT + (fileCount - 1) * CARD_FILE_GAP;

  return { columns, rows: fileCount, columnWidth, height, cells };
}

module.exports = {
  computeBandLayout,
  BAND_MARGIN_X,
  BAND_PADDING_Y,
  MIN_COLUMN_WIDTH,
  CARD_FILE_HEIGHT,
  CARD_FILE_GAP,
  CARD_LABEL_LINE_HEIGHT,
  CARD_VALUE_LINE_HEIGHT,
};

'use strict';

const { t } = require('../i18n');
const { formatReset } = require('./ai-usage-format');
const { truncateText } = require('./canvas-text');
const {
  computeBandLayout,
  BAND_PADDING_Y,
  CARD_FILE_HEIGHT,
  CARD_LABEL_LINE_HEIGHT,
  CARD_VALUE_LINE_HEIGHT,
} = require('./ai-usage-band-layout');

const BAND_BG_COLOR = 'rgba(0, 0, 0, 0.35)';
const SEPARATOR_COLOR = 'rgba(255, 255, 255, 0.15)';
const LABEL_FONT = '700 15px "Ubuntu", system-ui, sans-serif';
const VALUE_FONT = '400 14px "Ubuntu", system-ui, sans-serif';
const TEXT_COLOR = 'rgba(255, 255, 255, 0.90)';
const TEXT_COLOR_DIM = 'rgba(255, 255, 255, 0.60)';
const CARD_PADDING_X = 16;
const CARD_STALE_GAP = 8;
const WINDOW_LABEL_WIDTH = 24;
const BAR_WIDTH = 60;
const BAR_HEIGHT = 6;
const BAR_GAP = 8;
const PCT_COLUMN_WIDTH = 44;
const BAR_TRACK_COLOR = 'rgba(255, 255, 255, 0.25)';
const BAR_COLOR_OK = 'rgba(255, 255, 255, 0.90)';
const BAR_COLOR_WARN = 'rgba(245, 158, 11, 0.95)';
const BAR_COLOR_CRITICAL = 'rgba(239, 68, 68, 0.95)';
const BAR_WARN_PCT = 70;
const BAR_CRITICAL_PCT = 90;

/**
 * Color a usage bar according to its percentage: white below 70%,
 * amber from 70% to 89%, red from 90% up.
 * @param {number} pct - Percentage, 0-100.
 * @returns {string} CSS color.
 */
function barColor(pct) {
  if (pct >= BAR_CRITICAL_PCT) {
    return BAR_COLOR_CRITICAL;
  }
  if (pct >= BAR_WARN_PCT) {
    return BAR_COLOR_WARN;
  }
  return BAR_COLOR_OK;
}

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
 * Display label for a row: "CLAUDE <account>" for Claude, "CODEX" for Codex.
 * @param {{kind: 'claude'|'codex', label: string}} row - Usage row.
 * @returns {string} Localized row label.
 */
function rowLabel(row) {
  if (row.kind === 'codex') {
    return t('wallpaper.ai_usage.codex');
  }
  return `${t('wallpaper.ai_usage.claude')} ${row.label}`;
}

/**
 * Percentage text for a window, prefixed with '~' when inferred
 * (the real value is unknown until a fresh capture arrives).
 * @param {{pct: number, inferred: boolean}} win - Normalized window.
 * @returns {string} e.g. '23%' or '~0%'.
 */
function windowPctText(win) {
  const prefix = win.inferred ? '~' : '';
  return `${prefix}${Math.round(win.pct)}%`;
}

/**
 * Reset text for a window: the formatted reset, 'free' once expired,
 * or 'n/a' when the window itself is absent.
 * @param {{resetsAt: number, expired: boolean}|null} win - Normalized window.
 * @param {number} nowMs - Current time, epoch milliseconds.
 * @param {'it'|'en'} lang - Language.
 * @returns {string} Localized reset text.
 */
function windowResetText(win, nowMs, lang) {
  if (win === null) {
    return t('wallpaper.ai_usage.not_available');
  }
  if (win.expired) {
    return t('wallpaper.ai_usage.free');
  }
  return formatReset(win.resetsAt, nowMs, lang);
}

/**
 * Draw a usage bar: a dim track plus a colored fill proportional to pct.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {number} x - Left x coordinate.
 * @param {number} y - Top y coordinate.
 * @param {number} pct - Percentage, 0-100.
 */
function drawBar(ctx, x, y, pct) {
  ctx.fillStyle = BAR_TRACK_COLOR;
  ctx.fillRect(x, y, BAR_WIDTH, BAR_HEIGHT);
  const filledWidth = (Math.max(0, Math.min(100, pct)) / 100) * BAR_WIDTH;
  ctx.fillStyle = barColor(pct);
  ctx.fillRect(x, y, filledWidth, BAR_HEIGHT);
}

/**
 * Format a capture time as a local HH:MM string.
 * @param {number} capturedAtS - Capture time, epoch seconds.
 * @returns {string} e.g. '11:05'.
 */
function formatCapturedTime(capturedAtS) {
  const d = new Date(capturedAtS * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Draw one window line within a card: window name, bar (if the window
 * exists), percentage (or n/a) and reset text. The percentage and bar
 * are never truncated; only the reset text shrinks to fit availWidth.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {number} x - Left x coordinate of the line.
 * @param {number} y - Text baseline-top y coordinate.
 * @param {number} availWidth - Width available for the whole line.
 * @param {string} windowLabel - '5h' or '7d/7g'.
 * @param {object|null} win - Normalized window, or null when absent.
 * @param {number} nowMs - Current time, epoch milliseconds.
 * @param {'it'|'en'} lang - Language.
 */
function drawWindowBlock(ctx, x, y, availWidth, windowLabel, win, nowMs, lang) {
  ctx.font = VALUE_FONT;
  ctx.fillStyle = TEXT_COLOR_DIM;
  ctx.fillText(windowLabel, x, y);

  const barX = x + WINDOW_LABEL_WIDTH + BAR_GAP;
  const pctX = barX + BAR_WIDTH + BAR_GAP;

  if (win === null) {
    ctx.fillStyle = TEXT_COLOR_DIM;
    ctx.fillText(t('wallpaper.ai_usage.not_available'), pctX, y);
    return;
  }

  drawBar(ctx, barX, y + 4, win.pct);
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(windowPctText(win), pctX, y);

  const resetX = pctX + PCT_COLUMN_WIDTH;
  const resetMaxWidth = Math.max(0, x + availWidth - resetX);
  ctx.fillStyle = TEXT_COLOR_DIM;
  ctx.fillText(truncateText(ctx, windowResetText(win, nowMs, lang), resetMaxWidth), resetX, y);
}

/**
 * Draw a card's label line: the bold account/codex label, truncated to
 * leave room for the "updated HH:MM" suffix when the row is stale.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {object} row - Usage row.
 * @param {number} x - Left x coordinate.
 * @param {number} y - Text baseline-top y coordinate.
 * @param {number} maxWidth - Width available for the whole line.
 */
function drawCardLabelLine(ctx, row, x, y, maxWidth) {
  const label = rowLabel(row);
  if (!row.stale) {
    ctx.font = LABEL_FONT;
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(truncateText(ctx, label, maxWidth), x, y);
    return;
  }

  ctx.font = VALUE_FONT;
  const staleText = t('wallpaper.ai_usage.updated', { time: formatCapturedTime(row.capturedAt) });
  const staleWidth = ctx.measureText(staleText).width;
  const labelMaxWidth = Math.max(0, maxWidth - staleWidth - CARD_STALE_GAP);

  ctx.font = LABEL_FONT;
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(truncateText(ctx, label, labelMaxWidth), x, y);

  ctx.font = VALUE_FONT;
  ctx.fillStyle = TEXT_COLOR_DIM;
  ctx.fillText(staleText, x + maxWidth - staleWidth, y);
}

/**
 * Draw one account card: label line, then the 5h and 7d window lines.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {object} row - Usage row.
 * @param {{x: number, y: number, width: number}} cell - Card rectangle (y already absolute).
 * @param {number} nowMs - Current time, epoch milliseconds.
 * @param {'it'|'en'} lang - Language.
 */
function drawCard(ctx, row, cell, nowMs, lang) {
  const contentX = cell.x + CARD_PADDING_X;
  const contentWidth = cell.width - CARD_PADDING_X * 2;
  const line2Y = cell.y + CARD_LABEL_LINE_HEIGHT;
  const line3Y = line2Y + CARD_VALUE_LINE_HEIGHT;

  drawCardLabelLine(ctx, row, contentX, cell.y, contentWidth);
  drawWindowBlock(
    ctx,
    contentX,
    line2Y,
    contentWidth,
    t('wallpaper.ai_usage.five_hour'),
    row.fiveHour,
    nowMs,
    lang,
  );
  drawWindowBlock(
    ctx,
    contentX,
    line3Y,
    contentWidth,
    t('wallpaper.ai_usage.seven_day'),
    row.sevenDay,
    nowMs,
    lang,
  );
}

/**
 * Draw the thin vertical separator between two adjacent cards in the
 * same card-row.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {number} x - X coordinate of the shared edge.
 * @param {number} y - Top y coordinate.
 * @param {number} height - Separator height, in pixels.
 */
function drawCardSeparator(ctx, x, y, height) {
  ctx.strokeStyle = SEPARATOR_COLOR;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y + height);
  ctx.stroke();
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
    drawCard(ctx, row, { ...cell, y: cellY }, nowMs, lang);
  });
}

module.exports = { bandHeight, bandTop, drawUsageBand };

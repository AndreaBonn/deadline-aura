'use strict';

const { t } = require('../i18n');
const { formatReset } = require('./ai-usage-format');
const { truncateText } = require('./canvas-text');

const WIDE_LAYOUT_MIN_WIDTH = 1600;
const BAND_MARGIN_X = 48;
const BAND_PADDING_Y = 16;
const ROW_HEIGHT_WIDE = 32;
const ROW_HEIGHT_NARROW = 56;
const LINE_HEIGHT_NARROW = 24;
const BAND_BG_COLOR = 'rgba(0, 0, 0, 0.35)';
const LABEL_FONT = '700 13px "Ubuntu", system-ui, sans-serif';
const VALUE_FONT = '400 13px "Ubuntu", system-ui, sans-serif';
const TEXT_COLOR = 'rgba(255, 255, 255, 0.90)';
const TEXT_COLOR_DIM = 'rgba(255, 255, 255, 0.60)';
const LABEL_MAX_WIDTH_WIDE = 150;
const LABEL_MAX_WIDTH_NARROW = 110;
const NARROW_INDENT = 24;
const WINDOW_BLOCK_WIDTH = 270;
const BAR_WIDTH = 50;
const BAR_HEIGHT = 6;
const BAR_GAP = 8;
const PCT_COLUMN_WIDTH = 46;
const WINDOW_LABEL_WIDTH = 20;
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
 * A region narrower than WIDE_LAYOUT_MIN_WIDTH lays out each account
 * on two lines instead of one, so the same row count is taller there.
 * @param {object[]} rows - Usage rows.
 * @param {{width: number}} region - Display region.
 * @returns {number} Band height, in pixels (0 for an empty row set).
 */
function bandHeight(rows, region) {
  if (rows.length === 0) {
    return 0;
  }
  const rowHeight = region.width < WIDE_LAYOUT_MIN_WIDTH ? ROW_HEIGHT_NARROW : ROW_HEIGHT_WIDE;
  return BAND_PADDING_Y * 2 + rows.length * rowHeight;
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
 * Draw one window block: window name, bar (if the window exists),
 * percentage (or n/a) and reset text, at fixed column offsets.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {number} x - Left x coordinate of the block.
 * @param {number} y - Text baseline-top y coordinate.
 * @param {string} windowLabel - '5h' or '7d/7g'.
 * @param {object|null} win - Normalized window, or null when absent.
 * @param {number} nowMs - Current time, epoch milliseconds.
 * @param {'it'|'en'} lang - Language.
 */
function drawWindowBlock(ctx, x, y, windowLabel, win, nowMs, lang) {
  ctx.font = LABEL_FONT;
  ctx.fillStyle = TEXT_COLOR_DIM;
  ctx.fillText(windowLabel, x, y);

  const barX = x + WINDOW_LABEL_WIDTH + BAR_GAP;
  const pctX = barX + BAR_WIDTH + BAR_GAP;
  ctx.font = VALUE_FONT;

  if (win === null) {
    ctx.fillStyle = TEXT_COLOR_DIM;
    ctx.fillText(t('wallpaper.ai_usage.not_available'), pctX, y);
    return;
  }

  drawBar(ctx, barX, y + 3, win.pct);
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(windowPctText(win), pctX, y);

  const resetX = pctX + PCT_COLUMN_WIDTH;
  ctx.fillStyle = TEXT_COLOR_DIM;
  ctx.fillText(windowResetText(win, nowMs, lang), resetX, y);
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
 * Draw the "updated HH:MM" suffix for a stale row.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {{capturedAt: number}} row - Usage row.
 * @param {number} x - Left x coordinate.
 * @param {number} y - Text baseline-top y coordinate.
 */
function drawStaleSuffix(ctx, row, x, y) {
  ctx.font = VALUE_FONT;
  ctx.fillStyle = TEXT_COLOR_DIM;
  ctx.fillText(t('wallpaper.ai_usage.updated', { time: formatCapturedTime(row.capturedAt) }), x, y);
}

/**
 * Draw one row in the single-line (wide) layout: label, then the
 * 5h and 7d blocks side by side.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {object} row - Usage row.
 * @param {number} x - Left x coordinate.
 * @param {number} y - Text baseline-top y coordinate.
 * @param {number} nowMs - Current time, epoch milliseconds.
 * @param {'it'|'en'} lang - Language.
 */
function drawWideRow(ctx, row, x, y, nowMs, lang) {
  ctx.font = LABEL_FONT;
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(truncateText(ctx, rowLabel(row), LABEL_MAX_WIDTH_WIDE), x, y);

  const fiveHourX = x + LABEL_MAX_WIDTH_WIDE + 16;
  drawWindowBlock(ctx, fiveHourX, y, t('wallpaper.ai_usage.five_hour'), row.fiveHour, nowMs, lang);

  const sevenDayX = fiveHourX + WINDOW_BLOCK_WIDTH;
  drawWindowBlock(ctx, sevenDayX, y, t('wallpaper.ai_usage.seven_day'), row.sevenDay, nowMs, lang);

  if (row.stale) {
    drawStaleSuffix(ctx, row, sevenDayX + WINDOW_BLOCK_WIDTH, y);
  }
}

/**
 * Draw one row in the two-line (narrow) layout: label + 5h on the
 * first line, indented 7d on the second.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {object} row - Usage row.
 * @param {number} x - Left x coordinate.
 * @param {number} y - Text baseline-top y coordinate of the first line.
 * @param {number} nowMs - Current time, epoch milliseconds.
 * @param {'it'|'en'} lang - Language.
 */
function drawNarrowRow(ctx, row, x, y, nowMs, lang) {
  ctx.font = LABEL_FONT;
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(truncateText(ctx, rowLabel(row), LABEL_MAX_WIDTH_NARROW), x, y);

  const fiveHourX = x + LABEL_MAX_WIDTH_NARROW + 16;
  drawWindowBlock(ctx, fiveHourX, y, t('wallpaper.ai_usage.five_hour'), row.fiveHour, nowMs, lang);

  const line2X = x + NARROW_INDENT;
  const line2Y = y + LINE_HEIGHT_NARROW;
  const sevenDayLabel = t('wallpaper.ai_usage.seven_day');
  drawWindowBlock(ctx, line2X, line2Y, sevenDayLabel, row.sevenDay, nowMs, lang);

  if (row.stale) {
    drawStaleSuffix(ctx, row, line2X + WINDOW_BLOCK_WIDTH, line2Y);
  }
}

/**
 * Draw the AI usage band across the full width of a region, anchored
 * to its bottom edge. A no-op when rows is empty.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {object[]} rows - Usage rows, as returned by collectUsage.
 * @param {{x: number, y: number, width: number, height: number}} region - Display region.
 * @param {{nowMs: number, lang: 'it'|'en'}} options - Current time and language.
 */
function drawUsageBand(ctx, rows, region, { nowMs, lang }) {
  const height = bandHeight(rows, region);
  if (height === 0) {
    return;
  }

  drawBandBackground(ctx, region, height);

  const isWide = region.width >= WIDE_LAYOUT_MIN_WIDTH;
  const rowHeight = isWide ? ROW_HEIGHT_WIDE : ROW_HEIGHT_NARROW;
  const startX = region.x + BAND_MARGIN_X;
  const top = region.y + region.height - height + BAND_PADDING_Y;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  rows.forEach((row, i) => {
    const y = top + i * rowHeight;
    if (isWide) {
      drawWideRow(ctx, row, startX, y, nowMs, lang);
    } else {
      drawNarrowRow(ctx, row, startX, y, nowMs, lang);
    }
  });
}

module.exports = { bandHeight, bandTop, drawUsageBand, WIDE_LAYOUT_MIN_WIDTH };

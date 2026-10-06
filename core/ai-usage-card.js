'use strict';

const { t } = require('../i18n');
const { formatReset } = require('./ai-usage-format');
const { truncateText } = require('./canvas-text');
const { CARD_LABEL_LINE_HEIGHT, CARD_VALUE_LINE_HEIGHT } = require('./ai-usage-band-layout');

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
 * are never truncated; only the reset text shrinks to fit the line.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {{x: number, y: number, width: number}} line - Line origin (text top) and width.
 * @param {{label: string, win: object|null}} block - Window name ('5h', '7g') and normalized window.
 * @param {{nowMs: number, lang: 'it'|'en'}} clock - Current time and language.
 */
function drawWindowBlock(ctx, line, { label, win }, { nowMs, lang }) {
  const { x, y, width } = line;
  ctx.font = VALUE_FONT;
  ctx.fillStyle = TEXT_COLOR_DIM;
  ctx.fillText(label, x, y);

  const barX = x + WINDOW_LABEL_WIDTH + BAR_GAP;
  const pctX = barX + BAR_WIDTH + BAR_GAP;
  if (win === null) {
    ctx.fillText(t('wallpaper.ai_usage.not_available'), pctX, y);
    return;
  }

  drawBar(ctx, barX, y + 4, win.pct);
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(windowPctText(win), pctX, y);

  const resetX = pctX + PCT_COLUMN_WIDTH;
  const resetMaxWidth = Math.max(0, x + width - resetX);
  ctx.fillStyle = TEXT_COLOR_DIM;
  ctx.fillText(truncateText(ctx, windowResetText(win, nowMs, lang), resetMaxWidth), resetX, y);
}

/**
 * Draw a card's label line: the bold account/codex label, truncated to
 * leave room for the "updated HH:MM" suffix when the row is stale.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {object} row - Usage row.
 * @param {{x: number, y: number, width: number}} line - Line origin (text top) and width.
 */
function drawCardLabelLine(ctx, row, { x, y, width }) {
  const label = rowLabel(row);
  if (!row.stale) {
    ctx.font = LABEL_FONT;
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(truncateText(ctx, label, width), x, y);
    return;
  }

  ctx.font = VALUE_FONT;
  const staleText = t('wallpaper.ai_usage.updated', { time: formatCapturedTime(row.capturedAt) });
  const staleWidth = ctx.measureText(staleText).width;
  const labelMaxWidth = Math.max(0, width - staleWidth - CARD_STALE_GAP);

  ctx.font = LABEL_FONT;
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(truncateText(ctx, label, labelMaxWidth), x, y);

  ctx.font = VALUE_FONT;
  ctx.fillStyle = TEXT_COLOR_DIM;
  ctx.fillText(staleText, x + width - staleWidth, y);
}

/**
 * Draw one account card: label line, then the 5h and 7d window lines.
 * @param {CanvasRenderingContext2D} ctx - Canvas context.
 * @param {object} row - Usage row.
 * @param {{x: number, y: number, width: number}} cell - Card rectangle (y already absolute).
 * @param {{nowMs: number, lang: 'it'|'en'}} clock - Current time and language.
 */
function drawCard(ctx, row, cell, clock) {
  const x = cell.x + CARD_PADDING_X;
  const width = cell.width - CARD_PADDING_X * 2;
  const fiveHourY = cell.y + CARD_LABEL_LINE_HEIGHT;
  const sevenDayY = fiveHourY + CARD_VALUE_LINE_HEIGHT;

  drawCardLabelLine(ctx, row, { x, y: cell.y, width });
  const fiveHour = { label: t('wallpaper.ai_usage.five_hour'), win: row.fiveHour };
  drawWindowBlock(ctx, { x, y: fiveHourY, width }, fiveHour, clock);
  const sevenDay = { label: t('wallpaper.ai_usage.seven_day'), win: row.sevenDay };
  drawWindowBlock(ctx, { x, y: sevenDayY, width }, sevenDay, clock);
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

module.exports = { drawCard, drawCardSeparator };

'use strict';

const { createCanvas, loadImage } = require('canvas');
const { getLanguage } = require('../i18n');
const {
  getBackgroundFile,
  BACKGROUNDS_DIR,
  resolveUnpackedDir,
} = require('./wallpaper-background');
const { renderPostits } = require('./postit-renderer');
const { computeCanvasGeometry } = require('./display-manager');
const { drawDailyAgenda } = require('./wallpaper-agenda');
const { bandTop, drawUsageBand } = require('./ai-usage-band');

function tintIntensity(score) {
  return 0.15 + score * 0.3;
}

async function loadBackgroundImage(filePath) {
  if (!filePath) {
    return null;
  }
  try {
    return await loadImage(filePath);
  } catch {
    // Background image not available
  }
  return null;
}

function drawFallbackGradient(ctx, palette, region) {
  const { h, s, l } = palette.hsl;
  const { x, y, width, height } = region;

  const baseColor = `hsl(${h}, ${Math.max(s - 10, 5)}%, ${Math.max(l - 2, 4)}%)`;
  ctx.fillStyle = baseColor;
  ctx.fillRect(x, y, width, height);

  const glowColor = `hsl(${h}, ${s}%, ${Math.min(l + 6, 22)}%)`;
  const glow = ctx.createRadialGradient(
    x + width * 0.35,
    y + height * 0.45,
    0,
    x + width * 0.35,
    y + height * 0.45,
    Math.max(width, height) * 0.65,
  );
  glow.addColorStop(0, glowColor);
  glow.addColorStop(0.55, `hsl(${h}, ${s}%, ${Math.min(l + 1, 14)}%)`);
  glow.addColorStop(1, baseColor);

  ctx.fillStyle = glow;
  ctx.fillRect(x, y, width, height);
}

function drawBackground(ctx, bgImage, region) {
  const { x, y, width, height } = region;

  // Cover-fit the image into the region
  const imgRatio = bgImage.width / bgImage.height;
  const regionRatio = width / height;

  let sx = 0;
  let sy = 0;
  let sw = bgImage.width;
  let sh = bgImage.height;

  if (imgRatio > regionRatio) {
    sw = bgImage.height * regionRatio;
    sx = (bgImage.width - sw) / 2;
  } else {
    sh = bgImage.width / regionRatio;
    sy = (bgImage.height - sh) / 2;
  }

  ctx.drawImage(bgImage, sx, sy, sw, sh, x, y, width, height);
}

function drawTintOverlay(ctx, palette, score, region) {
  const { h, s } = palette.hsl;
  const intensity = tintIntensity(score);
  const { x, y, width, height } = region;

  ctx.fillStyle = `hsla(${h}, ${s}%, 8%, ${intensity})`;
  ctx.fillRect(x, y, width, height);
}

/**
 * Draw one display region: background, daily agenda, AI usage band, and
 * pinned post-its, in back-to-front order.
 *
 * @param {import('canvas').CanvasRenderingContext2D} ctx
 * @param {object} region - A single entry from computeCanvasGeometry().regions.
 * @param {object} opts - Everything the region draw needs, forwarded from render().
 */
function drawRegion(
  ctx,
  region,
  { bgImage, palette, score, allTasks, usageRows, pinnedByDisplay, nowMs, lang },
) {
  // Background image or fallback gradient
  if (bgImage) {
    drawBackground(ctx, bgImage, region);
    drawTintOverlay(ctx, palette, score, region);
  } else {
    drawFallbackGradient(ctx, palette, region);
  }

  // Daily agenda (top-left) — all tasks with due_at today, only future,
  // bounded below by the AI usage band (or the region bottom when empty)
  drawDailyAgenda(ctx, allTasks, region, bandTop(usageRows, region));

  // AI usage band (bottom, full width)
  if (usageRows.length > 0) {
    drawUsageBand(ctx, usageRows, region, { nowMs, lang });
  }

  // Pinned post-it tasks
  const pinned = pinnedByDisplay ? pinnedByDisplay[region.displayId] || [] : [];
  renderPostits(ctx, pinned, region);
}

/**
 * Create the canvas for the full virtual desktop and paint the black base
 * that shows through wherever a region's background does not cover it.
 *
 * @param {number} totalWidth
 * @param {number} totalHeight
 * @returns {{canvas: import('canvas').Canvas, ctx: import('canvas').CanvasRenderingContext2D}}
 */
function createBaseCanvas(totalWidth, totalHeight) {
  const canvas = createCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext('2d');

  // Black base
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  return { canvas, ctx };
}

async function render({
  displays,
  palette,
  score,
  pinnedByDisplay,
  calendarEvents,
  usageRows = [],
  nowMs = Date.now(),
}) {
  const geometry = computeCanvasGeometry(displays);
  const { totalWidth, totalHeight, regions } = geometry;
  const { canvas, ctx } = createBaseCanvas(totalWidth, totalHeight);

  const bgFile = getBackgroundFile(score);
  const bgImage = await loadBackgroundImage(bgFile);
  const lang = getLanguage();
  const allTasks = calendarEvents || [];

  for (const region of regions) {
    drawRegion(ctx, region, {
      bgImage,
      palette,
      score,
      allTasks,
      usageRows,
      pinnedByDisplay,
      nowMs,
      lang,
    });
  }

  return canvas;
}

module.exports = { render, getBackgroundFile, BACKGROUNDS_DIR, resolveUnpackedDir };

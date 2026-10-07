'use strict';

const { createCanvas, loadImage } = require('canvas');
const { getLanguage } = require('../i18n');
const fs = require('fs');
const path = require('path');
const { renderPostits } = require('./postit-renderer');
const { computeCanvasGeometry } = require('./display-manager');
const { drawDailyAgenda } = require('./wallpaper-agenda');
const { bandTop, drawUsageBand } = require('./ai-usage-band');

// node-canvas reads image files in native C++, bypassing Electron's asar fs
// shim. Inside a packaged app the assets live in app.asar.unpacked (declared in
// build.asarUnpack), so the path must point there or loadImage() silently fails
// and the renderer falls back to the flat gradient. In dev there is no asar
// segment, so this is a no-op.
function resolveUnpackedDir(dir) {
  return dir.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
}

const BACKGROUNDS_DIR = resolveUnpackedDir(path.join(__dirname, '..', 'assets', 'backgrounds'));

const SUPPORTED_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];

// Filesystem filenames — NOT translatable (map to assets/backgrounds/{name}.png)
const BAND_NAMES = [
  { max: 0.2, name: 'calmo' },
  { max: 0.4, name: 'normale' },
  { max: 0.6, name: 'attenzione' },
  { max: 0.8, name: 'urgente' },
  { max: 1.0, name: 'critico' },
];

function findBackgroundFile(name) {
  for (const ext of SUPPORTED_EXTS) {
    const filePath = path.join(BACKGROUNDS_DIR, name + ext);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

function getBackgroundFile(score) {
  let bandName = BAND_NAMES[BAND_NAMES.length - 1].name;
  for (const band of BAND_NAMES) {
    if (score < band.max) {
      bandName = band.name;
      break;
    }
  }
  return findBackgroundFile(bandName);
}

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

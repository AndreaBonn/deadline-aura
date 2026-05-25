'use strict';

const { createCanvas, loadImage } = require('canvas');
const { t } = require('../i18n');
const fs = require('fs');
const path = require('path');
const { renderPostits } = require('./postit-renderer');
const { computeCanvasGeometry } = require('./display-manager');

const BACKGROUNDS_DIR = path.join(__dirname, '..', 'assets', 'backgrounds');

function truncateText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  const ellipsis = '…';
  let truncated = text;
  while (truncated.length > 0 && ctx.measureText(truncated + ellipsis).width > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return truncated + ellipsis;
}

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

function filterUpcomingEvents(allTasks) {
  const now = Date.now();
  const horizon = now + 24 * 3600 * 1000;

  return allTasks
    .filter((t) => {
      const time = t.start_at || t.due_at;
      if (!time) {
        return false;
      }
      return time >= now && time <= horizon;
    })
    .sort((a, b) => (a.start_at || a.due_at) - (b.start_at || b.due_at));
}

function mentalLoadBlockTop(engineResult, region) {
  if (!engineResult) {
    return region.y + region.height;
  }
  const margin = 60;
  return region.y + region.height - margin - 10;
}

function drawDailyAgenda(ctx, allTasks, region, engineResult) {
  const todayEvents = filterUpcomingEvents(allTasks);
  if (todayEvents.length === 0) {
    return;
  }

  const margin = 48;
  const startX = region.x + margin;
  const startY = region.y + margin;
  const lineHeight = 28;
  const headerHeight = 28;
  const gapToUrgency = 20;
  const availableHeight =
    mentalLoadBlockTop(engineResult, region) - startY - headerHeight - gapToUrgency;
  const maxItems = Math.max(1, Math.floor(availableHeight / lineHeight));

  // Header
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.font = '700 13px "Ubuntu", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.letterSpacing = '2px';
  ctx.fillText(t('wallpaper.next_24h'), startX, startY);

  // Separator line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startX, startY + 20);
  ctx.lineTo(startX + 420, startY + 20);
  ctx.stroke();

  const visible = todayEvents.slice(0, maxItems);

  for (let i = 0; i < visible.length; i++) {
    const ev = visible[i];
    const y = startY + 28 + i * lineHeight;

    // Time — prefer start_at for display, fall back to due_at
    const d = new Date(ev.start_at || ev.due_at);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    ctx.font = '600 12px "Ubuntu Mono", "Consolas", monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
    ctx.fillText(time, startX, y);

    // Source badge
    const badgeX = startX + 52;
    const badgeMap = {
      gcal: { label: t('wallpaper.cal_badge'), color: 'rgba(66, 133, 244, 0.5)' },
      gtasks: { label: t('wallpaper.tasks_badge'), color: 'rgba(52, 168, 83, 0.5)' },
      jira: { label: t('wallpaper.jira_badge'), color: 'rgba(255, 152, 0, 0.5)' },
    };
    const badge = badgeMap[ev.source] || badgeMap.jira;
    const badgeLabel = badge.label;
    const badgeColor = badge.color;

    ctx.fillStyle = badgeColor;
    ctx.font = '700 8px "Ubuntu", system-ui, sans-serif';
    const badgeWidth = ctx.measureText(badgeLabel).width + 8;
    ctx.beginPath();
    ctx.roundRect(badgeX, y - 1, badgeWidth, 14, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(badgeLabel, badgeX + 4, y + 2);

    // Title
    ctx.font = '400 12px "Ubuntu", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    const titleX = badgeX + badgeWidth + 10;
    const maxTitleWidth = 370;
    ctx.fillText(truncateText(ctx, ev.title, maxTitleWidth), titleX, y);
  }

  if (todayEvents.length > maxItems) {
    const y = startY + 28 + maxItems * lineHeight;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.60)';
    ctx.font = '400 11px "Ubuntu", system-ui, sans-serif';
    ctx.fillText(t('wallpaper.others', { n: todayEvents.length - maxItems }), startX, y);
  }
}

function drawMentalLoad(ctx, engineResult, region) {
  if (!engineResult) {
    return;
  }

  const margin = 60;
  const pct = (engineResult.global_score * 100).toFixed(0);
  const y = region.y + region.height - margin;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';

  // Percentage — large and prominent
  ctx.font = '700 32px "Ubuntu", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fillText(`${pct}%`, region.x + margin, y);

  // Label
  const pctWidth = ctx.measureText(`${pct}%`).width;
  ctx.font = '400 16px "Ubuntu", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fillText(t('wallpaper.mental_load'), region.x + margin + pctWidth + 12, y - 5);
}

async function render({ displays, palette, score, engineResult, pinnedByDisplay, calendarEvents }) {
  const geometry = computeCanvasGeometry(displays);
  const { totalWidth, totalHeight, regions } = geometry;

  const canvas = createCanvas(totalWidth, totalHeight);
  const ctx = canvas.getContext('2d');

  // Black base
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  const bgFile = getBackgroundFile(score);
  const bgImage = await loadBackgroundImage(bgFile);

  for (const region of regions) {
    // Background image or fallback gradient
    if (bgImage) {
      drawBackground(ctx, bgImage, region);
      drawTintOverlay(ctx, palette, score, region);
    } else {
      drawFallbackGradient(ctx, palette, region);
    }

    // Daily agenda (top-left) — all tasks with due_at today, only future
    const allTasks = calendarEvents || [];
    drawDailyAgenda(ctx, allTasks, region, engineResult);

    // Mental load indicator (bottom-left)
    drawMentalLoad(ctx, engineResult, region);

    // Pinned post-it tasks
    const pinned = pinnedByDisplay ? pinnedByDisplay[region.displayId] || [] : [];
    renderPostits(ctx, pinned, region);
  }

  return canvas;
}

module.exports = { render, getBackgroundFile, BACKGROUNDS_DIR };

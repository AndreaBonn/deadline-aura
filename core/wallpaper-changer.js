'use strict';

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawnSync } = require('child_process');

const DATA_DIR = path.join(os.homedir(), '.local', 'share', 'deadlineaura');
const WALLPAPER_PATH = path.join(DATA_DIR, 'wallpaper.png');
const MIN_SCORE_DELTA = 0.02;

let lastScore = null;

function detectResolution() {
  try {
    const result = execSync('xrandr --current 2>/dev/null | grep "*"', {
      encoding: 'utf-8',
      timeout: 3000,
    });
    const match = result.match(/(\d+)x(\d+)/);
    if (match) {
      return { width: parseInt(match[1], 10), height: parseInt(match[2], 10) };
    }
  } catch {
    // xrandr not available or failed
  }
  return { width: 1920, height: 1080 };
}

function generateWallpaper(palette, resolution) {
  const { width, height } = resolution;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const { h, s, l } = palette.hsl;
  const baseColor = `hsl(${h}, ${s}%, ${l}%)`;
  const centerColor = `hsl(${h}, ${s}%, ${Math.min(l + 3, 20)}%)`;

  const gradient = ctx.createRadialGradient(
    width * 0.4,
    height * 0.5,
    0,
    width * 0.4,
    height * 0.5,
    Math.max(width, height) * 0.7,
  );
  gradient.addColorStop(0, centerColor);
  gradient.addColorStop(1, baseColor);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  return canvas;
}

function renderTextOverlay(ctx, engineResult, palette, width, height) {
  if (!engineResult || !engineResult.tasks || engineResult.tasks.length === 0) {
    return;
  }

  const textColor = 'rgba(255, 255, 255, 0.12)';
  const subtleColor = 'rgba(255, 255, 255, 0.06)';

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const marginLeft = 60;
  const marginBottom = 80;
  let y = height - marginBottom - engineResult.tasks.slice(0, 3).length * 32;

  ctx.font = '600 13px sans-serif';
  ctx.fillStyle = subtleColor;
  ctx.fillText(`urgency ${(engineResult.global_score * 100).toFixed(0)}%`, marginLeft, y - 24);

  ctx.font = '400 14px sans-serif';
  for (const task of engineResult.tasks.slice(0, 3)) {
    ctx.fillStyle = textColor;
    ctx.fillText(task.title, marginLeft, y);

    if (task.hours_remaining !== null) {
      const hrs = Math.abs(task.hours_remaining);
      const label = task.hours_remaining < 0 ? 'scaduto' : `${hrs.toFixed(0)}h`;
      ctx.fillStyle = subtleColor;
      ctx.fillText(label, marginLeft + 300, y);
    }

    y += 32;
  }
}

function setWallpaper(filePath) {
  const uri = `file://${filePath}`;

  const gsettingsOk = (args) => spawnSync('gsettings', args, { timeout: 5000 }).status === 0;

  try {
    const r1 = gsettingsOk(['set', 'org.gnome.desktop.background', 'picture-uri', uri]);
    const r2 = gsettingsOk(['set', 'org.gnome.desktop.background', 'picture-uri-dark', uri]);
    const r3 = gsettingsOk(['set', 'org.gnome.desktop.background', 'picture-options', 'zoom']);

    if (r1 && r2 && r3) {
      return 'gsettings';
    }
  } catch {
    // gsettings not available
  }

  try {
    const result = spawnSync('feh', ['--bg-scale', filePath], { timeout: 5000 });
    if (result.status === 0) {
      return 'feh';
    }
  } catch {
    // feh not available
  }

  return null;
}

function update(palette, { engineResult = null, force = false, resolution = null } = {}) {
  if (!force && lastScore !== null && Math.abs(palette.hsl.h - lastScore) < MIN_SCORE_DELTA * 160) {
    return { changed: false, reason: 'delta below threshold' };
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const res = resolution || detectResolution();
  const canvas = generateWallpaper(palette, res);

  if (engineResult) {
    const ctx = canvas.getContext('2d');
    renderTextOverlay(ctx, engineResult, palette, res.width, res.height);
  }

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(WALLPAPER_PATH, buffer);

  const method = setWallpaper(WALLPAPER_PATH);
  lastScore = palette.hsl.h;

  return { changed: true, method, path: WALLPAPER_PATH };
}

module.exports = {
  update,
  generateWallpaper,
  detectResolution,
  WALLPAPER_PATH,
};

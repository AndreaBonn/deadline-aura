'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const wallpaperRenderer = require('./wallpaper-renderer');
const { detectDisplays } = require('./display-manager');
const pinnedQueries = require('../store/pinned-queries');

const DATA_DIR = path.join(os.homedir(), '.local', 'share', 'deadlineaura');
const WALLPAPER_PATH = path.join(DATA_DIR, 'wallpaper.png');
const MIN_SCORE_DELTA = 0.02;

let lastScore = null;
let overlayOpen = false;

function setOverlayOpen(open) {
  overlayOpen = open;
}

function isOverlayOpen() {
  return overlayOpen;
}

function setWallpaper(filePath) {
  const uri = `file://${filePath}`;

  const gsettingsOk = (args) => spawnSync('gsettings', args, { timeout: 5000 }).status === 0;

  try {
    const displays = detectDisplays();
    const pictureOption = displays.length > 1 ? 'spanned' : 'zoom';

    const r1 = gsettingsOk(['set', 'org.gnome.desktop.background', 'picture-uri', uri]);
    const r2 = gsettingsOk(['set', 'org.gnome.desktop.background', 'picture-uri-dark', uri]);
    const r3 = gsettingsOk([
      'set',
      'org.gnome.desktop.background',
      'picture-options',
      pictureOption,
    ]);

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

async function update(
  palette,
  { engineResult = null, force = false, electronScreen = null, calendarEvents = null } = {},
) {
  if (overlayOpen) {
    return { changed: false, reason: 'overlay open' };
  }

  if (!force && lastScore !== null && Math.abs(palette.hsl.h - lastScore) < MIN_SCORE_DELTA * 160) {
    return { changed: false, reason: 'delta below threshold' };
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const displays = detectDisplays(electronScreen);
  const score = engineResult ? engineResult.global_score : 0;

  // Group pinned tasks by display
  const allPinned = pinnedQueries.getAllPinned();
  const pinnedByDisplay = {};
  for (const p of allPinned) {
    if (!pinnedByDisplay[p.display_id]) {
      pinnedByDisplay[p.display_id] = [];
    }
    pinnedByDisplay[p.display_id].push(p);
  }

  // If single display, also map 'default' pinned to actual display id
  if (displays.length === 1) {
    const displayId = displays[0].id;
    if (!pinnedByDisplay[displayId] && pinnedByDisplay['default']) {
      pinnedByDisplay[displayId] = pinnedByDisplay['default'];
    }
  }

  const allTasks = engineResult ? engineResult.tasks : [];

  const canvas = await wallpaperRenderer.render({
    displays,
    palette,
    score,
    engineResult,
    pinnedByDisplay,
    calendarEvents: calendarEvents || allTasks,
  });

  const buffer = canvas.toBuffer('image/png');

  // GNOME caches wallpaper by URI — use timestamped path to force reload
  const timestampedPath = path.join(DATA_DIR, `wallpaper-${Date.now()}.png`);
  fs.writeFileSync(timestampedPath, buffer);

  const method = setWallpaper(timestampedPath);

  // Cleanup old wallpapers
  try {
    const files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.startsWith('wallpaper-') && f !== path.basename(timestampedPath));
    for (const old of files) {
      fs.unlinkSync(path.join(DATA_DIR, old));
    }
  } catch {
    // cleanup is best-effort
  }

  lastScore = palette.hsl.h;

  return { changed: true, method, path: timestampedPath };
}

module.exports = {
  update,
  setWallpaper,
  setOverlayOpen,
  isOverlayOpen,
  WALLPAPER_PATH,
};

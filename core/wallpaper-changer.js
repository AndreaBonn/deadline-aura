'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');
const wallpaperRenderer = require('./wallpaper-renderer');
const { detectDisplays } = require('./display-manager');
const pinnedQueries = require('../store/pinned-queries');
const { usageSignature } = require('./ai-usage');

const DATA_DIR = path.join(os.homedir(), '.local', 'share', 'deadlineaura');
const WALLPAPER_PATH = path.join(DATA_DIR, 'wallpaper.png');
const MIN_SCORE_DELTA = 0.02;
const MAX_REDRAW_INTERVAL_MS = 15 * 60 * 1000;

let lastScore = null;
let lastSignature = null;
let lastRenderAt = null;
let overlayOpen = false;

/**
 * Decide whether a redraw is warranted (ADR-2): on an explicit force, a
 * visible hue change, a changed usage signature, or — only when the usage
 * signature is non-empty — a render staler than MAX_REDRAW_INTERVAL_MS.
 * Pure function: no module state, no I/O.
 *
 * @param {{force: boolean, hueChanged: boolean, prevSignature: string|null, nextSignature: string, lastRenderAt: number|null, nowMs: number}} args
 * @returns {boolean} True when a redraw should happen.
 */
function shouldRerender({ force, hueChanged, prevSignature, nextSignature, lastRenderAt, nowMs }) {
  if (force || hueChanged || nextSignature !== prevSignature) {
    return true;
  }
  if (nextSignature === '' || lastRenderAt === null) {
    return false;
  }
  return nowMs - lastRenderAt >= MAX_REDRAW_INTERVAL_MS;
}

/**
 * Encode a canvas as a PNG buffer using node-canvas's async callback form,
 * which runs the encode off the main thread (measured: ~0ms added main-
 * thread blocking vs ~235ms for the sync form on a 3840x1080 canvas).
 *
 * @param {import('canvas').Canvas} canvas - Canvas to encode.
 * @returns {Promise<Buffer>} Resolves with the PNG-encoded buffer.
 */
function encodePng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBuffer((err, buffer) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(buffer);
    }, 'image/png');
  });
}

/**
 * Render the wallpaper and write it to a fresh timestamped path (GNOME
 * caches by URI, so a stable path would not force a reload).
 *
 * @param {object} renderArgs - Forwarded verbatim to wallpaperRenderer.render.
 * @returns {Promise<string>} The absolute path the PNG was written to.
 */
async function renderAndWriteWallpaper(renderArgs) {
  const canvas = await wallpaperRenderer.render(renderArgs);
  const buffer = await encodePng(canvas);
  const timestampedPath = path.join(DATA_DIR, `wallpaper-${Date.now()}.png`);
  await fs.promises.writeFile(timestampedPath, buffer);
  return timestampedPath;
}

/**
 * Best-effort removal of every stale wallpaper PNG, keeping only the one
 * just written.
 *
 * @param {string} keepPath - Absolute path of the wallpaper to keep.
 */
function cleanupOldWallpapers(keepPath) {
  try {
    const files = fs
      .readdirSync(DATA_DIR)
      .filter((f) => f.startsWith('wallpaper-') && f !== path.basename(keepPath));
    for (const old of files) {
      fs.unlinkSync(path.join(DATA_DIR, old));
    }
  } catch {
    // cleanup is best-effort
  }
}

/**
 * Reset module-level render state. Test-only: lets each test start from a
 * clean slate instead of inheriting lastScore/lastSignature/lastRenderAt
 * left behind by a previous test.
 */
function resetState() {
  lastScore = null;
  lastSignature = null;
  lastRenderAt = null;
}

function buildPinnedByDisplay(allPinned, displays) {
  if (!displays.length || !allPinned.length) {
    return {};
  }

  // Broadcast: every pinned task appears on every display
  const pinnedByDisplay = {};
  for (const display of displays) {
    pinnedByDisplay[display.id] = [...allPinned];
  }
  return pinnedByDisplay;
}

function setOverlayOpen(open) {
  overlayOpen = open;
}

function isOverlayOpen() {
  return overlayOpen;
}

function setWallpaper(filePath) {
  const uri = `file://${filePath}`;

  const gsettingsOk = (args) =>
    childProcess.spawnSync('gsettings', args, { timeout: 5000 }).status === 0;

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
    const result = childProcess.spawnSync('feh', ['--bg-scale', filePath], { timeout: 5000 });
    if (result.status === 0) {
      return 'feh';
    }
  } catch {
    // feh not available
  }

  return null;
}

/**
 * Decide whether `update()` should proceed to a render: closes over the
 * overlay flag and the lastScore/lastSignature/lastRenderAt module state.
 *
 * @param {object} palette - Current palette, as passed to update().
 * @param {{force: boolean, usageRows: Array, nowMs: number}} args
 * @returns {{proceed: false, reason: string}|{proceed: true, nextSignature: string}}
 */
function decideRerender(palette, { force, usageRows, nowMs }) {
  if (overlayOpen) {
    return { proceed: false, reason: 'overlay open' };
  }

  const hueChanged =
    lastScore === null || Math.abs(palette.hsl.h - lastScore) >= MIN_SCORE_DELTA * 160;
  const nextSignature = usageSignature(usageRows, nowMs);

  const proceed = shouldRerender({
    force,
    hueChanged,
    prevSignature: lastSignature,
    nextSignature,
    lastRenderAt,
    nowMs,
  });

  return proceed
    ? { proceed: true, nextSignature }
    : { proceed: false, reason: 'delta below threshold' };
}

/**
 * Collect everything render() needs beyond palette/calendarEvents/usageRows:
 * the data directory, the displays, the score, and the pinned tasks grouped
 * by display.
 *
 * @param {object|null} engineResult - Deadline-engine run result, or null.
 * @param {object|null} electronScreen - Electron's `screen` module, or null.
 * @returns {{displays: Array, score: number, pinnedByDisplay: object, allTasks: Array}}
 */
function gatherRenderInputs(engineResult, electronScreen) {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  const displays = detectDisplays(electronScreen);
  const score = engineResult ? engineResult.global_score : 0;

  // Group pinned tasks by display, remapping stale IDs to primary
  const allPinned = pinnedQueries.getAllPinned();
  const pinnedByDisplay = buildPinnedByDisplay(allPinned, displays);
  const allTasks = engineResult ? engineResult.tasks : [];

  return { displays, score, pinnedByDisplay, allTasks };
}

/**
 * Apply the freshly rendered wallpaper to the desktop, clean up stale PNGs,
 * and persist the module-level render state.
 *
 * @param {string} timestampedPath - Absolute path of the PNG just written.
 * @param {number} hue - Palette hue to remember as lastScore.
 * @param {string} nextSignature - Usage signature to remember as lastSignature.
 * @param {number} nowMs - Timestamp to remember as lastRenderAt.
 * @returns {{changed: true, method: string|null, path: string}}
 */
function applyRenderResult(timestampedPath, hue, nextSignature, nowMs) {
  const method = setWallpaper(timestampedPath);
  cleanupOldWallpapers(timestampedPath);

  lastScore = hue;
  lastSignature = nextSignature;
  lastRenderAt = nowMs;

  return { changed: true, method, path: timestampedPath };
}

async function update(
  palette,
  {
    engineResult = null,
    force = false,
    electronScreen = null,
    calendarEvents = null,
    usageRows = [],
    nowMs = Date.now(),
  } = {},
) {
  const decision = decideRerender(palette, { force, usageRows, nowMs });
  if (!decision.proceed) {
    return { changed: false, reason: decision.reason };
  }

  const { displays, score, pinnedByDisplay, allTasks } = gatherRenderInputs(
    engineResult,
    electronScreen,
  );

  const timestampedPath = await renderAndWriteWallpaper({
    displays,
    palette,
    score,
    pinnedByDisplay,
    calendarEvents: calendarEvents || allTasks,
    usageRows,
    nowMs,
  });

  return applyRenderResult(timestampedPath, palette.hsl.h, decision.nextSignature, nowMs);
}

module.exports = {
  update,
  setWallpaper,
  setOverlayOpen,
  isOverlayOpen,
  buildPinnedByDisplay,
  shouldRerender,
  resetState,
  WALLPAPER_PATH,
};

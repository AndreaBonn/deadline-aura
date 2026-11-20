'use strict';

const fs = require('fs');
const path = require('path');
const { inspectCustomBackground } = require('./custom-background');

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

// Band names correspond to filenames in assets/backgrounds.
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

const CUSTOM_VEIL_ALPHA = 0.15;

function planBackground({ mode, customPath, score }) {
  if (mode === 'gradient') {
    return { kind: 'gradient', file: null, veil: 'none' };
  }
  if (mode === 'custom' && customPath) {
    return { kind: 'custom', file: customPath, veil: 'neutral' };
  }
  const plan = { kind: 'dynamic', file: getBackgroundFile(score), veil: 'tint' };
  return mode === 'custom' ? { ...plan, fallbackReason: 'NOT_SET' } : plan;
}

async function loadDynamicImage(file, { loadImage, log }) {
  if (!file) {
    return null;
  }
  try {
    return await loadImage(file);
  } catch (err) {
    // Photo unavailable: the caller paints the fallback gradient
    log.warn('[wallpaper] dynamic background unavailable:', file, err.message);
    return null;
  }
}

async function loadFallback(reason, deps) {
  const { log, score } = deps;
  log.warn(`[wallpaper] custom background unavailable (${reason}), falling back to dynamic`);
  const plan = planBackground({ mode: 'dynamic', score });
  return { image: await loadDynamicImage(plan.file, deps), veil: plan.veil };
}

/**
 * Load the image a background plan asks for, falling back to the dynamic
 * photo (with one warning) when a custom file cannot be used.
 *
 * @param {{kind: string, file: string|null, veil: string, fallbackReason?: string}} plan
 * @param {{loadImage: Function, log: {warn: Function}, score: number}} deps
 * @returns {Promise<{image: object|null, veil: 'tint'|'neutral'|'none'}>}
 */
async function loadBackground(plan, deps) {
  if (plan.kind === 'gradient') {
    return { image: null, veil: 'none' };
  }
  if (plan.fallbackReason) {
    return loadFallback(plan.fallbackReason, deps);
  }
  if (plan.kind === 'custom') {
    const inspection = inspectCustomBackground(plan.file);
    if (!inspection.ok) {
      return loadFallback(inspection.error, deps);
    }
    try {
      return { image: await deps.loadImage(plan.file), veil: plan.veil };
    } catch (err) {
      return loadFallback(err.message, deps);
    }
  }
  return { image: await loadDynamicImage(plan.file, deps), veil: plan.veil };
}

module.exports = {
  planBackground,
  loadBackground,
  CUSTOM_VEIL_ALPHA,
  getBackgroundFile,
  BACKGROUNDS_DIR,
  resolveUnpackedDir,
};

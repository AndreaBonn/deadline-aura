'use strict';

const fs = require('fs');
const path = require('path');

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

module.exports = {
  planBackground,
  CUSTOM_VEIL_ALPHA,
  getBackgroundFile,
  BACKGROUNDS_DIR,
  resolveUnpackedDir,
};

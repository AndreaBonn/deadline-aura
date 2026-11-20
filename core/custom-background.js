'use strict';

const fs = require('fs');
const path = require('path');
const { imageSize } = require('image-size');
const { CUSTOM_BACKGROUND_FILES } = require('../config/schema');

const MAX_CUSTOM_BACKGROUND_BYTES = 25 * 1024 * 1024;
const MAX_CUSTOM_BACKGROUND_PIXELS = 40_000_000;
const PNG_MAGIC = Buffer.from('89504e47', 'hex');
const JPEG_MAGIC = Buffer.from('ffd8ff', 'hex');

function getFormat(buffer) {
  if (buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return 'png';
  }
  if (buffer.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)) {
    return 'jpg';
  }
  return null;
}

function readHeader(filePath, expectedFormat) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const size = Math.min(fs.fstatSync(fd).size, MAX_CUSTOM_BACKGROUND_BYTES);
    const buffer = Buffer.alloc(size);
    const bytesRead = fs.readSync(fd, buffer, 0, size, 0);
    const header = buffer.subarray(0, bytesRead);
    const format = getFormat(header);
    if (!format || (expectedFormat && format !== expectedFormat)) {
      return { ok: false, error: 'UNREADABLE' };
    }
    const { width, height } = imageSize(header);
    if (!width || !height) {
      return { ok: false, error: 'UNREADABLE' };
    }
    if (width * height > MAX_CUSTOM_BACKGROUND_PIXELS) {
      return { ok: false, error: 'TOO_MANY_PIXELS' };
    }
    return { ok: true, width, height };
  } catch {
    return { ok: false, error: 'UNREADABLE' };
  } finally {
    fs.closeSync(fd);
  }
}

function inspectCustomBackground(filePath) {
  try {
    if (fs.lstatSync(filePath).isSymbolicLink()) {
      return { ok: false, error: 'SYMLINK' };
    }
    return readHeader(filePath);
  } catch (err) {
    return { ok: false, error: err.code === 'ENOENT' ? 'MISSING' : 'UNREADABLE' };
  }
}

function describeCustomBackground(file, { dataDir }) {
  const empty = { file, width: null, height: null };
  if (file === null) {
    return { state: 'none', ...empty };
  }
  const result = inspectCustomBackground(path.join(dataDir, file));
  if (result.ok) {
    return { state: 'ok', file, width: result.width, height: result.height };
  }
  return { state: result.error === 'MISSING' ? 'missing' : 'unreadable', ...empty };
}

function warnFailure(phase, err) {
  console.warn(`[wallpaper] ${phase} failed:`, err.code || err.name, err.message);
}

// Cleanup is best effort: a failure here must never change an outcome already computed.
function removeQuietly(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch (err) {
    warnFailure('temporary cleanup', err);
  }
}

function removeTemporaryFiles(dataDir) {
  for (const file of CUSTOM_BACKGROUND_FILES) {
    removeQuietly(path.join(dataDir, `${file}.tmp`));
  }
}

function copySource(sourcePath, temporaryPath) {
  try {
    const fd = fs.openSync(temporaryPath, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, fs.readFileSync(sourcePath));
    } finally {
      fs.closeSync(fd);
    }
    return true;
  } catch (err) {
    warnFailure('copy', err);
    return false;
  }
}

async function validateCopy(temporaryPath, format, loadImage) {
  try {
    if (fs.statSync(temporaryPath).size > MAX_CUSTOM_BACKGROUND_BYTES) {
      return { ok: false, error: 'TOO_LARGE' };
    }
    const result = readHeader(temporaryPath, format);
    if (!result.ok) {
      return result;
    }
    await loadImage(temporaryPath);
    return result;
  } catch (err) {
    warnFailure('validation', err);
    return { ok: false, error: 'UNREADABLE' };
  }
}

function checkSource(sourcePath, dataDir) {
  removeTemporaryFiles(dataDir);
  try {
    return fs.statSync(sourcePath).size > MAX_CUSTOM_BACKGROUND_BYTES ? 'TOO_LARGE' : null;
  } catch (err) {
    warnFailure('source check', err);
    return 'UNREADABLE';
  }
}

function removeOtherBackgrounds(dataDir, file) {
  for (const other of CUSTOM_BACKGROUND_FILES.filter((name) => name !== file)) {
    fs.rmSync(path.join(dataDir, other), { force: true });
  }
}

async function importCustomBackground(sourcePath, { dataDir, loadImage }) {
  const extension = path.extname(sourcePath).toLowerCase();
  if (!['.png', '.jpg', '.jpeg'].includes(extension)) {
    return { ok: false, error: 'UNSUPPORTED_FORMAT' };
  }
  const format = extension === '.png' ? 'png' : 'jpg';
  const file = CUSTOM_BACKGROUND_FILES.find((name) => name.endsWith(`.${format}`));
  const temporaryPath = path.join(dataDir, `${file}.tmp`);
  const sourceError = checkSource(sourcePath, dataDir);
  if (sourceError) {
    return { ok: false, error: sourceError };
  }
  try {
    if (!copySource(sourcePath, temporaryPath)) {
      return { ok: false, error: 'COPY_FAILED' };
    }
    const result = await validateCopy(temporaryPath, format, loadImage);
    if (!result.ok) {
      return result;
    }
    fs.renameSync(temporaryPath, path.join(dataDir, file));
    removeOtherBackgrounds(dataDir, file);
    return { ok: true, file, width: result.width, height: result.height };
  } catch (err) {
    warnFailure('import', err);
    return { ok: false, error: 'COPY_FAILED' };
  } finally {
    removeQuietly(temporaryPath);
  }
}

module.exports = {
  importCustomBackground,
  inspectCustomBackground,
  describeCustomBackground,
  MAX_CUSTOM_BACKGROUND_BYTES,
  MAX_CUSTOM_BACKGROUND_PIXELS,
};

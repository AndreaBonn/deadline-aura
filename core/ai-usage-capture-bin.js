'use strict';

/**
 * Packaging/runtime support for the AI usage capture script.
 *
 * The capture script (`claude-capture.py` + its two helper modules)
 * ships as an `extraResources` payload and is installed as the Claude
 * Code statusline command. That command must point at a path that
 * survives app updates, so at startup the app copies the resources
 * into a stable location (`~/.local/share/deadlineaura/bin`) and the
 * installer/status commands always run from that copy, never from
 * the versioned resources path.
 */

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DIR_MODE = 0o700;
const CAPTURE_FILES = [
  { name: 'claude-capture.py', mode: 0o700 },
  { name: 'capture_install.py', mode: 0o600 },
  { name: 'ai_usage_common.py', mode: 0o600 },
];
const VALID_ACTIONS = new Set(['install', 'uninstall', 'status']);
const PYTHON_BIN = '/usr/bin/python3';
const COMMAND_TIMEOUT_MS = 10000;
const STDERR_DETAIL_LIMIT = 500;

/**
 * Resolve the directory holding the capture script's source files.
 *
 * @param {object} params
 * @param {boolean} params.isPackaged - `app.isPackaged`.
 * @param {string} params.resourcesPath - `process.resourcesPath`.
 * @param {string} params.appDir - Project root in dev (e.g. `__dirname`).
 * @returns {string} Absolute path to the `ai-usage` source directory.
 */
function sourceDir({ isPackaged, resourcesPath, appDir }) {
  if (isPackaged) {
    return path.join(resourcesPath, 'ai-usage');
  }
  return path.join(appDir, 'scripts', 'ai-usage');
}

/**
 * Return the stable directory the capture script is copied into.
 *
 * @param {string} home - User home directory.
 * @returns {string} `<home>/.local/share/deadlineaura/bin`.
 */
function binDir(home) {
  return path.join(home, '.local', 'share', 'deadlineaura', 'bin');
}

function isSymlink(targetPath) {
  try {
    return fs.lstatSync(targetPath).isSymbolicLink();
  } catch {
    return false;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true, mode: DIR_MODE });
  try {
    fs.chmodSync(dirPath, DIR_MODE);
  } catch {
    /* best effort, mirrors the Python installer's ensure_dir */
  }
}

function hashFile(filePath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch (err) {
    throw new Error(`ai-usage-capture-bin: cannot read ${filePath}: ${err.message}`);
  }
}

function filesMatch(srcPath, destPath) {
  if (!fs.existsSync(destPath)) {
    return false;
  }
  return hashFile(srcPath) === hashFile(destPath);
}

function copyFileAtomic(srcPath, destPath, mode) {
  const dir = path.dirname(destPath);
  const tmpPath = path.join(dir, `.${path.basename(destPath)}.${process.pid}.${Date.now()}.tmp`);
  let content;
  try {
    content = fs.readFileSync(srcPath);
  } catch (err) {
    throw new Error(`ai-usage-capture-bin: cannot read ${srcPath}: ${err.message}`);
  }
  try {
    fs.writeFileSync(tmpPath, content, { mode });
    fs.chmodSync(tmpPath, mode);
    fs.renameSync(tmpPath, destPath);
  } finally {
    if (fs.existsSync(tmpPath)) {
      fs.rmSync(tmpPath, { force: true });
    }
  }
}

function assertNoSymlinkTargets(dest) {
  if (isSymlink(dest)) {
    throw new Error(`ai-usage-capture-bin: refusing to sync, destination is a symlink: ${dest}`);
  }
  for (const file of CAPTURE_FILES) {
    const destPath = path.join(dest, file.name);
    if (isSymlink(destPath)) {
      throw new Error(`ai-usage-capture-bin: refusing to sync, target is a symlink: ${destPath}`);
    }
  }
}

/**
 * Copy the capture script's source files into the stable bin dir,
 * re-copying only the files whose sha256 differs from the source.
 *
 * Refuses to write anything (no partial copy) if the destination
 * directory, or any of its three target files, is a symlink.
 *
 * @param {object} params
 * @param {string} params.source - Source `ai-usage` directory.
 * @param {string} params.dest - Destination bin directory.
 * @returns {{copied: string[], unchanged: string[]}}
 */
function syncCaptureBin({ source, dest }) {
  assertNoSymlinkTargets(dest);
  ensureDir(dest);

  const copied = [];
  const unchanged = [];
  for (const file of CAPTURE_FILES) {
    const srcPath = path.join(source, file.name);
    const destPath = path.join(dest, file.name);
    if (filesMatch(srcPath, destPath)) {
      unchanged.push(file.name);
      continue;
    }
    copyFileAtomic(srcPath, destPath, file.mode);
    copied.push(file.name);
  }
  return { copied, unchanged };
}

function truncate(text) {
  const str = String(text || '');
  return str.length > STDERR_DETAIL_LIMIT ? str.slice(0, STDERR_DETAIL_LIMIT) : str;
}

function parseCaptureResult(error, stdout, stderr) {
  if (error && error.code === 'ENOENT') {
    return { ok: false, error: 'python3_missing' };
  }
  if (error) {
    return { ok: false, error: 'command_failed', detail: truncate(stderr) };
  }
  try {
    return JSON.parse(stdout);
  } catch {
    return { ok: false, error: 'command_failed', detail: truncate(stderr) };
  }
}

/**
 * Run `claude-capture.py install|uninstall|status` from the stable bin
 * copy, without a shell, and parse its one-line JSON contract.
 *
 * @param {'install'|'uninstall'|'status'} action
 * @param {object} params
 * @param {string} params.home - User home directory.
 * @param {Function} [params.execFile] - Injectable `child_process.execFile`.
 * @returns {Promise<object>} The parsed result, or `{ ok, error, detail }`.
 */
function runCaptureCommand(action, { home, execFile = childProcess.execFile } = {}) {
  if (!VALID_ACTIONS.has(action)) {
    throw new Error(`ai-usage-capture-bin: invalid capture action "${action}"`);
  }
  const scriptPath = path.join(binDir(home), 'claude-capture.py');
  const options = { timeout: COMMAND_TIMEOUT_MS, env: { ...process.env, HOME: home } };
  return new Promise((resolve) => {
    execFile(PYTHON_BIN, ['-IS', scriptPath, action], options, (error, stdout, stderr) => {
      resolve(parseCaptureResult(error, stdout, stderr));
    });
  });
}

module.exports = { sourceDir, binDir, syncCaptureBin, runCaptureCommand };

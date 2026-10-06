'use strict';

const fs = require('fs');
const path = require('path');

const MAX_FILES = 20;
const TAIL_BYTES = 262144;
const ROLLOUT_FILE_PREFIX = 'rollout-';
const ROLLOUT_FILE_SUFFIX = '.jsonl';

/**
 * Read a directory's entries, returning null on any I/O error.
 *
 * @param {string} dir - Directory to read.
 * @returns {fs.Dirent[]|null}
 */
function readDirSafely(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
}

/**
 * Subdirectory entries, sorted by name descending (most recent first
 * for YYYY/MM/DD trees).
 *
 * @param {fs.Dirent[]} entries
 * @returns {fs.Dirent[]}
 */
function sortedSubdirs(entries) {
  return entries.filter((e) => e.isDirectory()).sort((a, b) => b.name.localeCompare(a.name));
}

/**
 * Rollout-*.jsonl file entries within a directory listing.
 *
 * @param {fs.Dirent[]} entries
 * @returns {fs.Dirent[]}
 */
function rolloutEntries(entries) {
  return entries.filter(
    (e) =>
      e.isFile() && e.name.startsWith(ROLLOUT_FILE_PREFIX) && e.name.endsWith(ROLLOUT_FILE_SUFFIX),
  );
}

/**
 * Recursively walk a directory tree, visiting subdirectories in
 * descending name order, collecting rollout files until MAX_FILES.
 *
 * @param {string} dir - Directory to walk.
 * @param {string[]} files - Accumulator, mutated in place.
 */
function walkMostRecentFirst(dir, files) {
  if (files.length >= MAX_FILES) {
    return;
  }
  const entries = readDirSafely(dir);
  if (!entries) {
    return;
  }

  // Take every rollout of this directory: readdir order is arbitrary, so
  // cutting here would drop recent files. Trimming happens after the mtime sort.
  for (const entry of rolloutEntries(entries)) {
    files.push(path.join(dir, entry.name));
  }
  for (const subdir of sortedSubdirs(entries)) {
    if (files.length >= MAX_FILES) {
      return;
    }
    walkMostRecentFirst(path.join(dir, subdir.name), files);
  }
}

/**
 * Collect rollout-*.jsonl paths under the sessions directory, descending
 * into the most recent YYYY/MM/DD subdirectories first (by descending name
 * order). Whole directories are taken until at least MAX_FILES are found.
 *
 * @param {string} sessionsDir - Absolute path to the sessions directory.
 * @returns {string[]} Absolute file paths, unsorted, possibly more than MAX_FILES.
 */
function collectRolloutFiles(sessionsDir) {
  const files = [];
  walkMostRecentFirst(sessionsDir, files);
  return files;
}

/**
 * Sort file paths by mtime, most recent first. Files that fail to stat
 * are dropped.
 *
 * @param {string[]} files - Absolute file paths.
 * @returns {string[]} Sorted file paths.
 */
function sortByMtimeDesc(files) {
  const withMtime = [];
  for (const filePath of files) {
    try {
      withMtime.push({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs });
    } catch {
      // Skipped: file disappeared or is unreadable between listing and stat.
    }
  }
  return withMtime.sort((a, b) => b.mtimeMs - a.mtimeMs).map((e) => e.filePath);
}

/**
 * Read the last TAIL_BYTES of a file as text lines, without loading the
 * whole file into memory.
 *
 * @param {string} filePath - Absolute path to the file.
 * @returns {string[]} Lines from the tail of the file.
 */
function readTailLines(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const readSize = Math.min(TAIL_BYTES, size);
    const buffer = Buffer.alloc(readSize);
    fs.readSync(fd, buffer, 0, readSize, size - readSize);
    return buffer.toString('utf8').split('\n');
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * List the most recent rollout files under a sessions directory, sorted
 * by mtime descending.
 *
 * @param {string} sessionsDir - Absolute path to the sessions directory.
 * @returns {string[]} Absolute file paths, most recent first, at most MAX_FILES.
 */
function listRecentRolloutFiles(sessionsDir) {
  return sortByMtimeDesc(collectRolloutFiles(sessionsDir)).slice(0, MAX_FILES);
}

module.exports = {
  listRecentRolloutFiles,
  readTailLines,
  MAX_FILES,
  TAIL_BYTES,
};

'use strict';

const os = require('os');
const path = require('path');
const { existsSync } = require('fs');
const {
  listRecentRolloutFiles,
  readTailLines,
  MAX_FILES,
  TAIL_BYTES,
} = require('./ai-usage-codex-fs');

const CODEX_LIMIT_ID = 'codex';
const FIVE_HOUR_WINDOW_MINUTES = 300;
const SEVEN_DAY_WINDOW_MINUTES = 10080;
const RESETS_AT_MS_THRESHOLD = 1e12;
const EMPTY_WINDOWS = { fiveHour: null, sevenDay: null, capturedAt: null };

/**
 * Normalize a resets_at value to epoch seconds (handles epoch-ms inputs).
 *
 * @param {number} resetsAt - Raw resets_at, seconds or milliseconds.
 * @returns {number} resets_at in epoch seconds.
 */
function toResetsAtSeconds(resetsAt) {
  return resetsAt > RESETS_AT_MS_THRESHOLD ? resetsAt / 1000 : resetsAt;
}

/**
 * Convert a raw window ({used_percent, window_minutes, resets_at}) into
 * the normalized shape, assigned to fiveHour/sevenDay by window_minutes.
 * Returns null for a missing window or one whose window_minutes doesn't
 * match a known bucket.
 *
 * @param {{used_percent: number, window_minutes: number, resets_at: number}|null} rawWindow
 * @returns {{bucket: 'fiveHour'|'sevenDay', window: {pct: number, resetsAt: number}}|null}
 */
function toBucketedWindow(rawWindow) {
  if (
    !rawWindow ||
    typeof rawWindow.used_percent !== 'number' ||
    typeof rawWindow.window_minutes !== 'number' ||
    typeof rawWindow.resets_at !== 'number'
  ) {
    return null;
  }

  const window = { pct: rawWindow.used_percent, resetsAt: toResetsAtSeconds(rawWindow.resets_at) };
  if (rawWindow.window_minutes === FIVE_HOUR_WINDOW_MINUTES) {
    return { bucket: 'fiveHour', window };
  }
  if (rawWindow.window_minutes === SEVEN_DAY_WINDOW_MINUTES) {
    return { bucket: 'sevenDay', window };
  }
  return null;
}

/**
 * Extract the rate_limits object from a parsed rollout event, by explicit
 * path only (never a generic merge over externally-read JSON).
 *
 * @param {object} obj - Parsed JSONL line.
 * @returns {object|null} The rate_limits object, or null if absent.
 */
function extractRateLimits(obj) {
  if (obj?.payload?.rate_limits && typeof obj.payload.rate_limits === 'object') {
    return obj.payload.rate_limits;
  }
  if (obj?.payload?.info?.rate_limits && typeof obj.payload.info.rate_limits === 'object') {
    return obj.payload.info.rate_limits;
  }
  if (obj?.rate_limits && typeof obj.rate_limits === 'object') {
    return obj.rate_limits;
  }
  return null;
}

/**
 * Whether a rate_limits object belongs to the codex limit (or omits
 * limit_id entirely).
 *
 * @param {object|null} rateLimits
 * @returns {boolean}
 */
function isCodexLimit(rateLimits) {
  return Boolean(rateLimits) && (!rateLimits.limit_id || rateLimits.limit_id === CODEX_LIMIT_ID);
}

/**
 * Parse a single JSONL line into an object, returning null for blank or
 * non-parseable input (a tail read may truncate the first line).
 *
 * @param {string} line - Raw JSONL line.
 * @returns {object|null}
 */
function parseLine(line) {
  if (!line || !line.trim()) {
    return null;
  }
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/**
 * Convert an ISO timestamp string to epoch seconds.
 *
 * @param {string|undefined} isoTimestamp
 * @returns {number|null} Epoch seconds, or null if missing/invalid.
 */
function toEpochSeconds(isoTimestamp) {
  if (typeof isoTimestamp !== 'string') {
    return null;
  }
  const ms = Date.parse(isoTimestamp);
  return Number.isNaN(ms) ? null : Math.floor(ms / 1000);
}

/**
 * Assign a bucketed window onto the accumulator in place, if present.
 *
 * @param {{fiveHour: object|null, sevenDay: object|null}} result - Mutated in place.
 * @param {{bucket: 'fiveHour'|'sevenDay', window: object}|null} bucketed
 */
function assignBucket(result, bucketed) {
  if (bucketed) {
    result[bucketed.bucket] = bucketed.window;
  }
}

/**
 * Parse Codex rollout JSONL lines (in chronological order) into the
 * latest known fiveHour/sevenDay usage windows.
 * Only events with limit_id 'codex' or no limit_id are honored. The
 * last non-null occurrence per window wins.
 *
 * @param {string[]} lines - Raw JSONL lines, in chronological order.
 * @returns {{fiveHour: {pct: number, resetsAt: number}|null, sevenDay: {pct: number, resetsAt: number}|null, capturedAt: number|null}}
 */
function parseRateLimitLines(lines) {
  const result = { fiveHour: null, sevenDay: null, capturedAt: null };

  for (const line of lines) {
    const obj = parseLine(line);
    if (!obj) {
      continue;
    }

    const rateLimits = extractRateLimits(obj);
    if (!isCodexLimit(rateLimits)) {
      continue;
    }

    assignBucket(result, toBucketedWindow(rateLimits.primary));
    assignBucket(result, toBucketedWindow(rateLimits.secondary));

    const eventCapturedAt = toEpochSeconds(obj.timestamp);
    if (eventCapturedAt !== null) {
      result.capturedAt = eventCapturedAt;
    }
  }

  return result;
}

/**
 * Resolve the Codex sessions directory, honoring CODEX_HOME.
 *
 * @param {NodeJS.ProcessEnv} env - Environment variables.
 * @param {string} home - User home directory.
 * @returns {string} Absolute path to the sessions directory.
 */
function resolveSessionsDir(env, home) {
  const codexHome = env.CODEX_HOME || path.join(home, '.codex');
  return path.join(codexHome, 'sessions');
}

/**
 * Read and parse a single rollout file's tail, isolating any I/O or
 * parse failure so one bad file doesn't break the whole read.
 *
 * @param {string} filePath - Absolute path to the file.
 * @returns {{fiveHour: object|null, sevenDay: object|null, capturedAt: number|null}}
 */
function parseFileSafely(filePath) {
  try {
    return parseRateLimitLines(readTailLines(filePath));
  } catch (err) {
    console.warn('ai-usage-codex: skipped an unreadable rollout file:', err.message);
    return EMPTY_WINDOWS;
  }
}

/**
 * Read Codex usage windows from the most recent rollout files on disk.
 * Merges from newest to oldest file until both windows are found, or
 * files run out. Per-file I/O errors are skipped with a warning.
 *
 * @param {{env?: NodeJS.ProcessEnv, home?: string}} [options]
 * @returns {{fiveHour: object|null, sevenDay: object|null, capturedAt: number|null}|null}
 */
function readCodexUsage({ env = process.env, home = os.homedir() } = {}) {
  const sessionsDir = resolveSessionsDir(env, home);
  if (!existsSync(sessionsDir)) {
    return null;
  }

  const result = { fiveHour: null, sevenDay: null, capturedAt: null };

  for (const filePath of listRecentRolloutFiles(sessionsDir)) {
    if (result.fiveHour && result.sevenDay) {
      break;
    }
    const parsed = parseFileSafely(filePath);
    result.fiveHour = result.fiveHour || parsed.fiveHour;
    result.sevenDay = result.sevenDay || parsed.sevenDay;
    result.capturedAt = result.capturedAt || parsed.capturedAt;
  }

  return result;
}

module.exports = {
  parseRateLimitLines,
  readCodexUsage,
  MAX_FILES,
  TAIL_BYTES,
};

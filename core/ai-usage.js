'use strict';

const os = require('os');

const { readClaudeUsage } = require('./ai-usage-claude');
const { readCodexUsage } = require('./ai-usage-codex');
const { normalizeWindow, isStale, countdownBucket, STALE_AFTER_MS } = require('./ai-usage-format');

const PCT_BUCKET_SIZE = 5;
const THRESHOLD_WARN = 70;
const THRESHOLD_CRITICAL = 90;
const THRESHOLD_FULL = 100;

const DEFAULT_READERS = { claude: readClaudeUsage, codex: readCodexUsage };

/**
 * Classify a percentage into the threshold level shown on the band
 * (also used by usageSignature to detect a visible level change).
 *
 * @param {number} pct - Percentage, 0-100.
 * @returns {'OK'|'WARN'|'CRITICAL'|'FULL'} Threshold level.
 */
function thresholdLevel(pct) {
  if (pct >= THRESHOLD_FULL) {
    return 'FULL';
  }
  if (pct >= THRESHOLD_CRITICAL) {
    return 'CRITICAL';
  }
  if (pct >= THRESHOLD_WARN) {
    return 'WARN';
  }
  return 'OK';
}

/**
 * Build the Claude usage rows, in the order returned by readClaudeUsage
 * (alphabetical by account, DoD). A reader failure is isolated: it is
 * logged and yields no Claude rows, leaving other sources unaffected.
 *
 * @param {Function} readClaude - Injected readClaudeUsage-compatible reader.
 * @param {string} home - User home directory.
 * @param {number} nowMs - Current time, epoch milliseconds.
 * @returns {object[]} Claude usage rows.
 */
function buildClaudeRows(readClaude, home, nowMs) {
  let entries;
  try {
    entries = readClaude({ home });
  } catch (err) {
    console.warn('ai-usage: failed to read Claude usage:', err.message);
    return [];
  }

  return entries.map(({ account, snapshot }) => ({
    kind: 'claude',
    label: account,
    available: snapshot !== null,
    stale: snapshot !== null && isStale(snapshot.capturedAt, nowMs, STALE_AFTER_MS),
    capturedAt: snapshot ? snapshot.capturedAt : null,
    fiveHour: snapshot ? normalizeWindow(snapshot.fiveHour, nowMs) : null,
    sevenDay: snapshot ? normalizeWindow(snapshot.sevenDay, nowMs) : null,
  }));
}

/**
 * Build the Codex usage row. Present only when a Codex sessions
 * directory was found (readCodex returns non-null). A reader failure
 * is isolated: it is logged and yields no Codex row, leaving other
 * sources unaffected.
 *
 * @param {Function} readCodex - Injected readCodexUsage-compatible reader.
 * @param {NodeJS.ProcessEnv} env - Environment variables.
 * @param {string} home - User home directory.
 * @param {number} nowMs - Current time, epoch milliseconds.
 * @returns {object|null} Codex usage row, or null when no row applies.
 */
function buildCodexRow(readCodex, env, home, nowMs) {
  let result;
  try {
    result = readCodex({ env, home });
  } catch (err) {
    console.warn('ai-usage: failed to read Codex usage:', err.message);
    return null;
  }
  if (result === null) {
    return null;
  }

  return {
    kind: 'codex',
    label: 'codex',
    available: true,
    stale: result.capturedAt !== null && isStale(result.capturedAt, nowMs, STALE_AFTER_MS),
    capturedAt: result.capturedAt,
    fiveHour: normalizeWindow(result.fiveHour, nowMs),
    sevenDay: normalizeWindow(result.sevenDay, nowMs),
  };
}

/**
 * Collect usage rows from every available source: Claude accounts
 * first (alphabetical, per readClaudeUsage), then Codex. Each
 * source's read failure is isolated so the other still renders (DoD
 * 5): it is logged and that source's row(s) are simply absent.
 *
 * @param {{home?: string, env?: NodeJS.ProcessEnv, nowMs?: number, lang?: 'it'|'en', readers?: {claude: Function, codex: Function}}} [options]
 *   `lang` is accepted for call-site symmetry with ai-usage-band, but unused
 *   here: rows carry raw normalized data, formatting/localization happens at
 *   render time.
 * @returns {object[]} Usage rows: {kind, label, available, stale, capturedAt, fiveHour, sevenDay}.
 */
function collectUsage(options = {}) {
  const {
    home = os.homedir(),
    env = process.env,
    nowMs = Date.now(),
    readers = DEFAULT_READERS,
  } = options;

  const rows = buildClaudeRows(readers.claude, home, nowMs);
  const codexRow = buildCodexRow(readers.codex, env, home, nowMs);
  if (codexRow) {
    rows.push(codexRow);
  }
  return rows;
}

/**
 * Signature fragment for a single usage window: stable within the
 * same visible 5%-bucket/threshold/countdown-bucket, changing exactly
 * when the drawn text would change (ADR-2).
 *
 * @param {{pct: number, resetsAt: number, expired: boolean}|null} win - Normalized window.
 * @param {number} nowMs - Current time, epoch milliseconds.
 * @returns {string} Signature fragment.
 */
function windowSignature(win, nowMs) {
  if (win === null) {
    return 'n';
  }
  const pctBucket = Math.floor(win.pct / PCT_BUCKET_SIZE);
  const level = thresholdLevel(win.pct);
  const expiredFlag = win.expired ? 1 : 0;
  const cdBucket = win.expired ? 0 : countdownBucket(win.resetsAt, nowMs);
  return `${pctBucket}|${level}|${expiredFlag}|${cdBucket}`;
}

/**
 * Deterministic signature for a full set of usage rows: changes only
 * when something visible on the band would change (ADR-2), so
 * shouldRerender can skip a redundant redraw.
 *
 * @param {object[]} rows - Usage rows, as returned by collectUsage.
 * @param {number} nowMs - Current time, epoch milliseconds.
 * @returns {string} Deterministic signature string.
 */
function usageSignature(rows, nowMs) {
  return rows
    .map((row) =>
      [
        row.kind,
        row.label,
        row.stale ? 1 : 0,
        windowSignature(row.fiveHour, nowMs),
        windowSignature(row.sevenDay, nowMs),
      ].join(':'),
    )
    .join(';');
}

module.exports = { collectUsage, usageSignature, thresholdLevel };

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const SNAPSHOT_SCHEMA_VERSION = 1;
const DEFAULT_ACCOUNT = 'default';
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const CREDENTIALS_FILENAME = '.credentials.json';

/**
 * Resolve the base directory where Claude usage snapshots live.
 *
 * @param {string} home - User home directory.
 * @returns {string} Absolute path to the ai-usage directory.
 */
function usageDir(home) {
  return path.join(home, '.local', 'share', 'deadlineaura', 'ai-usage');
}

/**
 * Resolve the directory containing the latest snapshot per account.
 *
 * @param {string} home - User home directory.
 * @returns {string} Absolute path to the latest snapshots directory.
 */
function snapshotDir(home) {
  return path.join(usageDir(home), 'latest');
}

/**
 * Check whether a cloak profile directory has a credentials file,
 * without ever reading its contents.
 *
 * @param {string} profileDir - Absolute path to the profile directory.
 * @returns {boolean}
 */
function hasCredentials(profileDir) {
  const credentialsPath = path.join(profileDir, CREDENTIALS_FILENAME);
  try {
    return fs.statSync(credentialsPath).isFile();
  } catch {
    return false;
  }
}

/**
 * List cloak profile ids that have a credentials file, restricted to
 * names matching ACCOUNT_ID_PATTERN.
 *
 * @param {string} home - User home directory.
 * @returns {string[]} Account ids with credentials.
 */
function cloakAccountsWithCredentials(home) {
  const profilesDir = path.join(home, '.cloak', 'profiles');
  let entries;
  try {
    entries = fs.readdirSync(profilesDir, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory() && ACCOUNT_ID_PATTERN.test(entry.name))
    .filter((entry) => hasCredentials(path.join(profilesDir, entry.name)))
    .map((entry) => entry.name);
}

/**
 * List account ids inferred from snapshot file names already on disk,
 * restricted to names matching ACCOUNT_ID_PATTERN.
 *
 * @param {string} home - User home directory.
 * @returns {string[]} Account ids with a snapshot file.
 */
function accountsWithSnapshot(home) {
  let entries;
  try {
    entries = fs.readdirSync(snapshotDir(home));
  } catch {
    return [];
  }

  return entries
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .filter((id) => ACCOUNT_ID_PATTERN.test(id));
}

/**
 * Check whether the cloak profiles directory exists.
 *
 * @param {string} home - User home directory.
 * @returns {boolean}
 */
function hasCloakProfilesDir(home) {
  try {
    return fs.statSync(path.join(home, '.cloak', 'profiles')).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check whether the default Claude config directory exists.
 *
 * @param {string} home - User home directory.
 * @returns {boolean}
 */
function hasDefaultClaudeDir(home) {
  try {
    return fs.statSync(path.join(home, '.claude')).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Discover Claude account ids present on this machine: cloak profiles
 * with credentials or a snapshot, otherwise the single default account
 * if ~/.claude exists. Always merged with any account id already found
 * in the snapshot directory. Names failing ACCOUNT_ID_PATTERN are
 * dropped silently.
 *
 * @param {{home?: string}} [options]
 * @returns {string[]} Account ids, deduplicated and alphabetically sorted.
 */
function discoverAccounts({ home = os.homedir() } = {}) {
  const ids = new Set();

  if (hasCloakProfilesDir(home)) {
    for (const id of cloakAccountsWithCredentials(home)) {
      ids.add(id);
    }
  } else if (hasDefaultClaudeDir(home)) {
    ids.add(DEFAULT_ACCOUNT);
  }

  for (const id of accountsWithSnapshot(home)) {
    ids.add(id);
  }

  return Array.from(ids).sort();
}

/**
 * Normalize one raw usage window from the snapshot file into
 * {pct, resetsAt}, or null if either field is missing or not finite.
 *
 * @param {{pct: unknown, resets_at: unknown}|undefined} rawWindow
 * @returns {{pct: number, resetsAt: number}|null}
 */
function normalizeSnapshotWindow(rawWindow) {
  if (!rawWindow || typeof rawWindow !== 'object') {
    return null;
  }
  const { pct, resets_at: resetsAt } = rawWindow;
  if (!Number.isFinite(pct) || !Number.isFinite(resetsAt)) {
    return null;
  }
  return { pct, resetsAt };
}

/**
 * Read and normalize the snapshot file for a single account.
 * Returns null when the file is absent (not yet captured), or when it
 * exists but is corrupted or has an unsupported schema version, in
 * which case a warning is logged without the file content.
 *
 * @param {string} account - Account id.
 * @param {{home?: string}} [options]
 * @returns {{account: string, capturedAt: number, fiveHour: object|null, sevenDay: object|null}|null}
 */
function readSnapshot(account, { home = os.homedir() } = {}) {
  const filePath = path.join(snapshotDir(home), `${account}.json`);

  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`ai-usage-claude: corrupted snapshot JSON for account "${account}"`);
    return null;
  }

  if (
    parsed?.v !== SNAPSHOT_SCHEMA_VERSION ||
    typeof parsed.account !== 'string' ||
    !Number.isFinite(parsed.captured_at)
  ) {
    console.warn(`ai-usage-claude: invalid snapshot schema for account "${account}"`);
    return null;
  }

  return {
    account: parsed.account,
    capturedAt: parsed.captured_at,
    fiveHour: normalizeSnapshotWindow(parsed.five_hour),
    sevenDay: normalizeSnapshotWindow(parsed.seven_day),
  };
}

/**
 * Read usage rows for every discovered Claude account.
 *
 * @param {{home?: string}} [options]
 * @returns {{account: string, snapshot: object|null}[]}
 */
function readClaudeUsage({ home = os.homedir() } = {}) {
  return discoverAccounts({ home }).map((account) => ({
    account,
    snapshot: readSnapshot(account, { home }),
  }));
}

module.exports = {
  usageDir,
  snapshotDir,
  discoverAccounts,
  readSnapshot,
  readClaudeUsage,
  DEFAULT_ACCOUNT,
  ACCOUNT_ID_PATTERN,
};

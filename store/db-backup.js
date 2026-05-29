'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_RETENTION = 3;
const BACKUP_SUBDIR = 'backups';

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

function sanitizeReason(reason) {
  return String(reason || 'unknown')
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .slice(0, 40);
}

function ensureBackupDir(dbDir) {
  const backupDir = path.join(dbDir, BACKUP_SUBDIR);
  fs.mkdirSync(backupDir, { recursive: true });
  return backupDir;
}

function listBackups(dbDir) {
  const backupDir = path.join(dbDir, BACKUP_SUBDIR);
  if (!fs.existsSync(backupDir)) {
    return [];
  }
  return fs
    .readdirSync(backupDir)
    .filter((name) => name.endsWith('.bak'))
    .map((name) => {
      const fullPath = path.join(backupDir, name);
      const stat = fs.statSync(fullPath);
      return { name, path: fullPath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function rotateBackups(dbDir, retention = DEFAULT_RETENTION) {
  const backups = listBackups(dbDir);
  const stale = backups.slice(retention);
  for (const entry of stale) {
    try {
      fs.unlinkSync(entry.path);
    } catch (err) {
      console.error(`[db-backup] failed to rotate ${entry.name}:`, err.message);
    }
  }
  return stale.length;
}

/**
 * Create a consistent snapshot of the database synchronously.
 *
 * better-sqlite3's native .backup() is async — incompatible with our sync
 * migration flow. Instead we checkpoint the WAL into the main file, then
 * fs.copyFileSync into the backup. This is safe at migration time because
 * the DB has just been opened and no concurrent writes are in flight.
 *
 * Returns the backup file path on success. Throws on failure — callers must
 * decide whether to abort the operation that prompted the backup (typically
 * a destructive migration: abort and skip the migration).
 */
function createBackup(database, dbPath, reason, { retention = DEFAULT_RETENTION } = {}) {
  const dbDir = path.dirname(dbPath);
  const backupDir = ensureBackupDir(dbDir);
  const timestamp = formatTimestamp(new Date());
  const safeReason = sanitizeReason(reason);
  const fileName = `db.sqlite.${timestamp}.${safeReason}.bak`;
  const targetPath = path.join(backupDir, fileName);

  // Flush WAL into the main DB file so the copy includes every committed
  // page. TRUNCATE rewrites the WAL file to zero size after checkpoint.
  database.pragma('wal_checkpoint(TRUNCATE)');
  fs.copyFileSync(dbPath, targetPath);

  rotateBackups(dbDir, retention);
  return targetPath;
}

module.exports = {
  createBackup,
  listBackups,
  rotateBackups,
  formatTimestamp,
  sanitizeReason,
  DEFAULT_RETENTION,
  BACKUP_SUBDIR,
};

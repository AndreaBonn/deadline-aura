'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createBackup,
  listBackups,
  rotateBackups,
  formatTimestamp,
  sanitizeReason,
  DEFAULT_RETENTION,
  BACKUP_SUBDIR,
} = require('../../store/db-backup');

let tmpDir;
let dbPath;
let pragmaCalls;
let fakeDatabase;

function buildFakeDatabase() {
  return {
    pragma(query) {
      pragmaCalls.push(query);
    },
  };
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dla-backup-test-'));
  dbPath = path.join(tmpDir, 'db.sqlite');
  fs.writeFileSync(dbPath, 'fake-sqlite-content');
  pragmaCalls = [];
  fakeDatabase = buildFakeDatabase();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('formatTimestamp', () => {
  it('renders a filesystem-safe ISO-like timestamp', () => {
    const ts = formatTimestamp(new Date('2026-05-29T16:42:07.000Z'));
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/);
  });
});

describe('sanitizeReason', () => {
  it('replaces unsafe characters with dashes', () => {
    expect(sanitizeReason('mig 007/off cat!')).toBe('mig-007-off-cat-');
  });

  it('caps the length so file names stay manageable', () => {
    const long = 'x'.repeat(200);
    expect(sanitizeReason(long).length).toBe(40);
  });

  it('falls back to "unknown" for empty input', () => {
    expect(sanitizeReason('')).toBe('unknown');
    expect(sanitizeReason(null)).toBe('unknown');
    expect(sanitizeReason(undefined)).toBe('unknown');
  });
});

describe('createBackup', () => {
  it('creates the backups subdirectory if missing', () => {
    createBackup(fakeDatabase, dbPath, 'mig-test');
    const backupDir = path.join(tmpDir, BACKUP_SUBDIR);
    expect(fs.existsSync(backupDir)).toBe(true);
  });

  it('checkpoints the WAL before copying', () => {
    createBackup(fakeDatabase, dbPath, 'mig-test');
    expect(pragmaCalls).toContain('wal_checkpoint(TRUNCATE)');
  });

  it('produces a backup file with the reason in its name', () => {
    const backupPath = createBackup(fakeDatabase, dbPath, 'mig-007');
    expect(backupPath).toMatch(/mig-007\.bak$/);
    expect(fs.existsSync(backupPath)).toBe(true);
  });

  it('copies the contents of the source database verbatim', () => {
    const backupPath = createBackup(fakeDatabase, dbPath, 'mig-test');
    expect(fs.readFileSync(backupPath, 'utf-8')).toBe('fake-sqlite-content');
  });

  it('keeps at most DEFAULT_RETENTION backups after repeated invocations', async () => {
    for (let i = 0; i < DEFAULT_RETENTION + 2; i++) {
      createBackup(fakeDatabase, dbPath, `mig-${i}`);
      // Force a unique mtime so the rotation has a deterministic order
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const remaining = listBackups(tmpDir);
    expect(remaining).toHaveLength(DEFAULT_RETENTION);
  });

  it('respects a custom retention value', async () => {
    for (let i = 0; i < 5; i++) {
      createBackup(fakeDatabase, dbPath, `mig-${i}`, { retention: 2 });
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const remaining = listBackups(tmpDir);
    expect(remaining).toHaveLength(2);
  });

  it('throws when the source file is missing so the migration aborts', () => {
    fs.unlinkSync(dbPath);
    expect(() => createBackup(fakeDatabase, dbPath, 'mig-missing')).toThrow();
  });
});

describe('listBackups', () => {
  it('returns an empty array when the backup dir does not exist', () => {
    expect(listBackups(tmpDir)).toEqual([]);
  });

  it('returns backups sorted by mtime descending', async () => {
    createBackup(fakeDatabase, dbPath, 'first');
    await new Promise((resolve) => setTimeout(resolve, 10));
    createBackup(fakeDatabase, dbPath, 'second');
    const backups = listBackups(tmpDir);
    expect(backups[0].name).toContain('second');
    expect(backups[1].name).toContain('first');
  });
});

describe('rotateBackups', () => {
  it('removes entries beyond the retention limit and returns the count removed', async () => {
    const backupDir = path.join(tmpDir, BACKUP_SUBDIR);
    fs.mkdirSync(backupDir, { recursive: true });
    for (let i = 0; i < 5; i++) {
      const stub = path.join(backupDir, `stub-${i}.bak`);
      fs.writeFileSync(stub, 'x');
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    const removed = rotateBackups(tmpDir, 2);
    expect(removed).toBe(3);
    expect(listBackups(tmpDir)).toHaveLength(2);
  });

  it('returns 0 and preserves all backups when count is already within retention', () => {
    const backupDir = path.join(tmpDir, BACKUP_SUBDIR);
    fs.mkdirSync(backupDir, { recursive: true });
    fs.writeFileSync(path.join(backupDir, 'a.bak'), 'x');
    fs.writeFileSync(path.join(backupDir, 'b.bak'), 'x');
    expect(rotateBackups(tmpDir, 3)).toBe(0);
    expect(listBackups(tmpDir)).toHaveLength(2);
  });
});

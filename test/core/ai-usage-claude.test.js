'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  discoverAccounts,
  readSnapshot,
  readClaudeUsage,
  snapshotDir,
  DEFAULT_ACCOUNT,
} = require('../../core/ai-usage-claude');

function writeSnapshot(home, account, data) {
  const dir = snapshotDir(home);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${account}.json`), JSON.stringify(data), 'utf8');
}

describe('core/ai-usage-claude', () => {
  let tmpHome;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-usage-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  describe('discoverAccounts', () => {
    it('includes cloak profiles with credentials, excludes those without credentials or snapshot', () => {
      const profilesDir = path.join(tmpHome, '.cloak', 'profiles');
      fs.mkdirSync(path.join(profilesDir, 'withcreds'), { recursive: true });
      fs.writeFileSync(path.join(profilesDir, 'withcreds', '.credentials.json'), '{}', 'utf8');

      fs.mkdirSync(path.join(profilesDir, 'bare'), { recursive: true });

      fs.mkdirSync(path.join(profilesDir, 'snaponly'), { recursive: true });
      writeSnapshot(tmpHome, 'snaponly', {
        v: 1,
        account: 'snaponly',
        captured_at: 1788800000,
      });

      const accounts = discoverAccounts({ home: tmpHome });

      expect(accounts).toEqual(['snaponly', 'withcreds']);
    });

    it('never reads the contents of .credentials.json, only checks existence', () => {
      const profilesDir = path.join(tmpHome, '.cloak', 'profiles');
      fs.mkdirSync(path.join(profilesDir, 'acct'), { recursive: true });
      fs.writeFileSync(path.join(profilesDir, 'acct', '.credentials.json'), '{"secret":1}', 'utf8');

      const readFileSpy = vi.spyOn(fs, 'readFileSync');

      discoverAccounts({ home: tmpHome });

      for (const call of readFileSpy.mock.calls) {
        expect(String(call[0])).not.toMatch(/\.credentials\.json$/);
      }
      readFileSpy.mockRestore();
    });

    it('falls back to [default] when ~/.claude exists and no cloak profiles dir', () => {
      fs.mkdirSync(path.join(tmpHome, '.claude'), { recursive: true });

      const accounts = discoverAccounts({ home: tmpHome });

      expect(accounts).toEqual([DEFAULT_ACCOUNT]);
    });

    it('returns an empty array when neither cloak, .claude nor any snapshot exist', () => {
      const accounts = discoverAccounts({ home: tmpHome });

      expect(accounts).toEqual([]);
    });

    it('excludes profile and snapshot names that do not match the account id pattern', () => {
      const profilesDir = path.join(tmpHome, '.cloak', 'profiles');
      fs.mkdirSync(path.join(profilesDir, 'has space'), { recursive: true });
      fs.writeFileSync(path.join(profilesDir, 'has space', '.credentials.json'), '{}', 'utf8');

      fs.mkdirSync(snapshotDir(tmpHome), { recursive: true });
      fs.writeFileSync(path.join(snapshotDir(tmpHome), 'has space.json'), '{}', 'utf8');

      const accounts = discoverAccounts({ home: tmpHome });

      expect(accounts).toEqual([]);
    });
  });

  describe('readSnapshot', () => {
    it('returns null when the snapshot file is absent, without warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(readSnapshot('ghost', { home: tmpHome })).toBeNull();

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('returns null and warns when the snapshot path is a directory (EISDIR)', () => {
      const dir = snapshotDir(tmpHome);
      fs.mkdirSync(path.join(dir, 'notafile.json'), { recursive: true });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const snapshot = readSnapshot('notafile', { home: tmpHome });

      expect(snapshot).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('reads a valid snapshot into the normalized shape', () => {
      writeSnapshot(tmpHome, 'delivery', {
        v: 1,
        account: 'delivery',
        captured_at: 1788800000,
        five_hour: { pct: 23.0, resets_at: 1788812345 },
        seven_day: { pct: 41.0, resets_at: 1789300000 },
      });

      const snapshot = readSnapshot('delivery', { home: tmpHome });

      expect(snapshot).toEqual({
        account: 'delivery',
        capturedAt: 1788800000,
        fiveHour: { pct: 23.0, resetsAt: 1788812345 },
        sevenDay: { pct: 41.0, resetsAt: 1789300000 },
      });
    });

    it('returns null and warns on corrupted JSON', () => {
      const dir = snapshotDir(tmpHome);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'broken.json'), 'not json at all', 'utf8');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const snapshot = readSnapshot('broken', { home: tmpHome });

      expect(snapshot).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('returns null when v is not 1', () => {
      writeSnapshot(tmpHome, 'oldver', { v: 2, account: 'oldver', captured_at: 1788800000 });
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      expect(readSnapshot('oldver', { home: tmpHome })).toBeNull();

      warnSpy.mockRestore();
    });

    it('nulls out only the invalid window, keeping the other valid one', () => {
      writeSnapshot(tmpHome, 'partial', {
        v: 1,
        account: 'partial',
        captured_at: 1788800000,
        five_hour: { pct: '23', resets_at: 1788812345 },
        seven_day: { pct: 41.0, resets_at: 1789300000 },
      });

      const snapshot = readSnapshot('partial', { home: tmpHome });

      expect(snapshot.fiveHour).toBeNull();
      expect(snapshot.sevenDay).toEqual({ pct: 41.0, resetsAt: 1789300000 });
    });

    it('omits a window entirely absent from the file', () => {
      writeSnapshot(tmpHome, 'onewindow', {
        v: 1,
        account: 'onewindow',
        captured_at: 1788800000,
        seven_day: { pct: 41.0, resets_at: 1789300000 },
      });

      const snapshot = readSnapshot('onewindow', { home: tmpHome });

      expect(snapshot.fiveHour).toBeNull();
      expect(snapshot.sevenDay).toEqual({ pct: 41.0, resetsAt: 1789300000 });
    });
  });

  describe('readClaudeUsage', () => {
    it('pairs each discovered account with its snapshot (or null)', () => {
      fs.mkdirSync(path.join(tmpHome, '.claude'), { recursive: true });
      writeSnapshot(tmpHome, DEFAULT_ACCOUNT, {
        v: 1,
        account: DEFAULT_ACCOUNT,
        captured_at: 1788800000,
        five_hour: { pct: 10, resets_at: 1788812345 },
      });

      const rows = readClaudeUsage({ home: tmpHome });

      expect(rows).toEqual([
        {
          account: DEFAULT_ACCOUNT,
          snapshot: {
            account: DEFAULT_ACCOUNT,
            capturedAt: 1788800000,
            fiveHour: { pct: 10, resetsAt: 1788812345 },
            sevenDay: null,
          },
        },
      ]);
    });

    it('returns an empty array when no account is discovered', () => {
      expect(readClaudeUsage({ home: tmpHome })).toEqual([]);
    });
  });
});

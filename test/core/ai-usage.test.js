'use strict';

const { collectUsage, usageSignature, thresholdLevel } = require('../../core/ai-usage');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { syncCaptureBin } = require('../../core/ai-usage-capture-bin');

const NOW_MS = new Date('2026-10-06T12:00:00.000Z').getTime();

function claudeRow(account, overrides = {}) {
  return {
    account,
    snapshot: {
      account,
      capturedAt: Math.floor(NOW_MS / 1000) - 60,
      fiveHour: { pct: 23, resetsAt: Math.floor(NOW_MS / 1000) + 2 * 3600 },
      sevenDay: { pct: 41, resetsAt: Math.floor(NOW_MS / 1000) + 3 * 86400 },
      ...overrides,
    },
  };
}

function fakeReaders({ claude = () => [], codex = () => null } = {}) {
  return { claude, codex };
}

describe('thresholdLevel boundaries', () => {
  it.each([
    [69, 'OK'],
    [70, 'WARN'],
    [89, 'WARN'],
    [90, 'CRITICAL'],
    [99, 'CRITICAL'],
    [100, 'FULL'],
  ])('classifies %i percent as %s', (pct, expected) => {
    expect(thresholdLevel(pct)).toBe(expected);
  });
});

describe('syncCaptureBin I/O failures', () => {
  let home;
  let source;
  let dest;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), 'capture-bin-errors-'));
    source = path.join(home, 'source');
    dest = path.join(home, 'bin');
    fs.mkdirSync(source);
    for (const name of ['claude-capture.py', 'capture_install.py', 'ai_usage_common.py']) {
      fs.writeFileSync(path.join(source, name), `# ${name}\n`);
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(home, { recursive: true, force: true });
  });

  it('reports cannot read for a missing source and copies after it is restored', () => {
    const missing = path.join(source, 'claude-capture.py');
    fs.unlinkSync(missing);

    expect(() => syncCaptureBin({ source, dest })).toThrow(
      `ai-usage-capture-bin: cannot read ${missing}:`,
    );

    fs.writeFileSync(missing, '# restored\n');
    expect(syncCaptureBin({ source, dest }).copied).toHaveLength(3);
    expect(fs.readFileSync(path.join(dest, 'claude-capture.py'), 'utf8')).toBe('# restored\n');
  });

  // chmod cannot deny root access, so root would never exercise the failed rename.
  it.skipIf(process.getuid?.() === 0)(
    'removes the staged temp file after a permission-denied rename (requires non-root)',
    () => {
      const rename = fs.renameSync;
      // ensureDir resets permissions: lock only at the rename boundary, after staging.
      vi.spyOn(fs, 'renameSync').mockImplementationOnce((staged, target) => {
        expect(fs.readFileSync(staged, 'utf8')).toBe('# claude-capture.py\n');
        fs.chmodSync(dest, 0o500);
        try {
          return rename(staged, target);
        } finally {
          fs.chmodSync(dest, 0o700);
        }
      });

      expect(() => syncCaptureBin({ source, dest })).toThrow(/EACCES/);

      expect(fs.readdirSync(dest).filter((name) => name.endsWith('.tmp'))).toEqual([]);
      expect(syncCaptureBin({ source, dest }).copied).toHaveLength(3);
      expect(fs.readFileSync(path.join(dest, 'claude-capture.py'), 'utf8')).toBe(
        '# claude-capture.py\n',
      );
    },
  );
});

describe('core/ai-usage — collectUsage', () => {
  it('builds Claude rows from readClaudeUsage, preserving its ordering', () => {
    const readers = fakeReaders({ claude: () => [claudeRow('zeta'), claudeRow('alpha')] });

    const rows = collectUsage({ nowMs: NOW_MS, readers });

    expect(rows.map((r) => r.label)).toEqual(['zeta', 'alpha']);
    expect(rows.every((r) => r.kind === 'claude')).toBe(true);
  });

  it('appends the Codex row after every Claude row', () => {
    const readers = fakeReaders({
      claude: () => [claudeRow('delivery')],
      codex: () => ({ fiveHour: null, sevenDay: { pct: 100, resetsAt: 123 }, capturedAt: 123 }),
    });

    const rows = collectUsage({ nowMs: NOW_MS, readers });

    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe('claude');
    expect(rows[1].kind).toBe('codex');
  });

  it('omits the Codex row when readCodexUsage returns null (no sessions dir)', () => {
    const readers = fakeReaders({ claude: () => [claudeRow('delivery')], codex: () => null });

    const rows = collectUsage({ nowMs: NOW_MS, readers });

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('claude');
  });

  it('isolates a throwing Codex reader: Claude rows remain, Codex is absent, a warning is logged', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const readers = fakeReaders({
      claude: () => [claudeRow('delivery')],
      codex: () => {
        throw new Error('boom');
      },
    });

    const rows = collectUsage({ nowMs: NOW_MS, readers });

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('claude');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('isolates a throwing Claude reader: Codex row remains, Claude is absent, a warning is logged', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const readers = fakeReaders({
      claude: () => {
        throw new Error('boom');
      },
      codex: () => ({ fiveHour: null, sevenDay: null, capturedAt: null }),
    });

    const rows = collectUsage({ nowMs: NOW_MS, readers });

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe('codex');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('marks a Claude row unavailable when its account has no snapshot yet', () => {
    const readers = fakeReaders({ claude: () => [{ account: 'fresh', snapshot: null }] });

    const rows = collectUsage({ nowMs: NOW_MS, readers });

    expect(rows[0]).toMatchObject({
      kind: 'claude',
      label: 'fresh',
      available: false,
      stale: false,
      capturedAt: null,
      fiveHour: null,
      sevenDay: null,
    });
  });

  it('marks a row stale once its capture is older than STALE_AFTER_MS', () => {
    const staleCapturedAt = Math.floor(NOW_MS / 1000) - 3600; // 1h ago > 30min threshold
    const readers = fakeReaders({
      claude: () => [claudeRow('delivery', { capturedAt: staleCapturedAt })],
    });

    const rows = collectUsage({ nowMs: NOW_MS, readers });

    expect(rows[0].stale).toBe(true);
  });

  it('normalizes an already-passed reset to an expired, inferred 0% window', () => {
    const readers = fakeReaders({
      claude: () => [
        claudeRow('delivery', {
          fiveHour: { pct: 55, resetsAt: Math.floor(NOW_MS / 1000) - 10 },
        }),
      ],
    });

    const rows = collectUsage({ nowMs: NOW_MS, readers });

    expect(rows[0].fiveHour).toEqual({
      pct: 0,
      resetsAt: Math.floor(NOW_MS / 1000) - 10,
      inferred: true,
      expired: true,
    });
  });
});

describe('core/ai-usage — usageSignature', () => {
  function rowsWithFiveHourPct(pct) {
    const readers = fakeReaders({
      claude: () => [
        claudeRow('delivery', { fiveHour: { pct, resetsAt: Math.floor(NOW_MS / 1000) + 7200 } }),
      ],
    });
    return collectUsage({ nowMs: NOW_MS, readers });
  }

  it('stays unchanged within the same 5% bucket', () => {
    const sigA = usageSignature(rowsWithFiveHourPct(61), NOW_MS);
    const sigB = usageSignature(rowsWithFiveHourPct(63), NOW_MS);
    expect(sigA).toBe(sigB);
  });

  it('changes when the percentage crosses the 70% threshold', () => {
    const sigBelow = usageSignature(rowsWithFiveHourPct(69), NOW_MS);
    const sigAt = usageSignature(rowsWithFiveHourPct(70), NOW_MS);
    expect(sigBelow).not.toBe(sigAt);
  });

  it('changes once a reset passes (expired flips false -> true)', () => {
    const resetsAt = Math.floor(NOW_MS / 1000) + 60;
    const readers = fakeReaders({
      claude: () => [claudeRow('delivery', { fiveHour: { pct: 50, resetsAt } })],
    });
    const rows = collectUsage({ nowMs: NOW_MS, readers });

    const sigBefore = usageSignature(rows, NOW_MS);
    const sigAfter = usageSignature(rows, NOW_MS + 120 * 1000); // 2 minutes later, past the reset
    expect(sigBefore).not.toBe(sigAfter);
  });

  it('changes when the countdown crosses into the next bucket', () => {
    const resetsAt = Math.floor(NOW_MS / 1000) + 100 * 60; // 100 minutes out
    const readers = fakeReaders({
      claude: () => [claudeRow('delivery', { fiveHour: { pct: 50, resetsAt } })],
    });
    const rows = collectUsage({ nowMs: NOW_MS, readers });

    const sigA = usageSignature(rows, NOW_MS);
    const sigB = usageSignature(rows, NOW_MS + 16 * 60 * 1000); // crossed one 15-min step
    expect(sigA).not.toBe(sigB);
  });

  it('is identical for two independently-collected but equivalent row sets', () => {
    const rowsA = rowsWithFiveHourPct(23);
    const rowsB = rowsWithFiveHourPct(23);
    expect(usageSignature(rowsA, NOW_MS)).toBe(usageSignature(rowsB, NOW_MS));
  });
});

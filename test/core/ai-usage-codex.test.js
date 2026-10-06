'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseRateLimitLines, readCodexUsage } = require('../../core/ai-usage-codex');

function jsonl(...objects) {
  return objects.map((o) => JSON.stringify(o)).join('\n') + '\n';
}

function eventLine({ timestamp, rateLimits }) {
  return {
    timestamp,
    type: 'event_msg',
    payload: { type: 'token_count', rate_limits: rateLimits },
  };
}

describe('parseRateLimitLines', () => {
  it('assigns a primary window with window_minutes 10080 to sevenDay', () => {
    const lines = jsonl(
      eventLine({
        timestamp: '2026-10-06T12:00:00.000Z',
        rateLimits: {
          limit_id: 'codex',
          primary: { used_percent: 100, window_minutes: 10080, resets_at: 1791762832 },
          secondary: null,
        },
      }),
    ).split('\n');

    const result = parseRateLimitLines(lines);

    expect(result.sevenDay).toEqual({ pct: 100, resetsAt: 1791762832 });
    expect(result.fiveHour).toBeNull();
  });

  it('assigns a primary window with window_minutes 300 to fiveHour and secondary 10080 to sevenDay', () => {
    const lines = jsonl(
      eventLine({
        timestamp: '2026-07-05T14:30:38.444Z',
        rateLimits: {
          limit_id: 'codex',
          primary: { used_percent: 1, window_minutes: 300, resets_at: 1783276996 },
          secondary: { used_percent: 14, window_minutes: 10080, resets_at: 1783389806 },
        },
      }),
    ).split('\n');

    const result = parseRateLimitLines(lines);

    expect(result.fiveHour).toEqual({ pct: 1, resetsAt: 1783276996 });
    expect(result.sevenDay).toEqual({ pct: 14, resetsAt: 1783389806 });
  });

  it('does not overwrite previous windows with a premium event carrying null windows', () => {
    const lines = jsonl(
      eventLine({
        timestamp: '2026-09-18T15:19:00.000Z',
        rateLimits: {
          limit_id: 'codex',
          primary: { used_percent: 50, window_minutes: 300, resets_at: 1700000000 },
          secondary: null,
        },
      }),
      eventLine({
        timestamp: '2026-09-18T15:19:10.990Z',
        rateLimits: { limit_id: 'premium', primary: null, secondary: null },
      }),
    ).split('\n');

    const result = parseRateLimitLines(lines);

    expect(result.fiveHour).toEqual({ pct: 50, resetsAt: 1700000000 });
  });

  it('ignores a truncated (non-parseable) first line from a tail read', () => {
    const goodLine = eventLine({
      timestamp: '2026-10-06T12:00:00.000Z',
      rateLimits: {
        limit_id: 'codex',
        primary: { used_percent: 23, window_minutes: 300, resets_at: 1700000000 },
        secondary: null,
      },
    });
    const truncated = '{"timestamp":"2026-10-06T11:';
    const lines = [truncated, JSON.stringify(goodLine)];

    const result = parseRateLimitLines(lines);

    expect(result.fiveHour).toEqual({ pct: 23, resetsAt: 1700000000 });
  });

  it('converts a resets_at in milliseconds down to seconds', () => {
    const resetsAtMs = 1_800_000_000_000;
    const lines = [
      JSON.stringify(
        eventLine({
          timestamp: '2026-10-06T12:00:00.000Z',
          rateLimits: {
            limit_id: 'codex',
            primary: { used_percent: 10, window_minutes: 300, resets_at: resetsAtMs },
            secondary: null,
          },
        }),
      ),
    ];

    const result = parseRateLimitLines(lines);

    expect(result.fiveHour.resetsAt).toBe(resetsAtMs / 1000);
  });

  it('keeps the last non-null occurrence per window across chronological lines', () => {
    const lines = [
      JSON.stringify(
        eventLine({
          timestamp: '2026-10-06T10:00:00.000Z',
          rateLimits: {
            limit_id: 'codex',
            primary: { used_percent: 10, window_minutes: 300, resets_at: 1700000000 },
            secondary: null,
          },
        }),
      ),
      JSON.stringify(
        eventLine({
          timestamp: '2026-10-06T11:00:00.000Z',
          rateLimits: {
            limit_id: 'codex',
            primary: { used_percent: 55, window_minutes: 300, resets_at: 1700003600 },
            secondary: null,
          },
        }),
      ),
    ];

    const result = parseRateLimitLines(lines);

    expect(result.fiveHour).toEqual({ pct: 55, resetsAt: 1700003600 });
  });

  it('returns capturedAt as the epoch-seconds timestamp of the last useful event', () => {
    const lines = [
      JSON.stringify(
        eventLine({
          timestamp: '2026-10-06T12:00:00.000Z',
          rateLimits: {
            limit_id: 'codex',
            primary: { used_percent: 10, window_minutes: 300, resets_at: 1700000000 },
            secondary: null,
          },
        }),
      ),
    ];

    const result = parseRateLimitLines(lines);

    expect(result.capturedAt).toBe(
      Math.floor(new Date('2026-10-06T12:00:00.000Z').getTime() / 1000),
    );
  });

  it('returns capturedAt null when no event has a timestamp', () => {
    const result = parseRateLimitLines([]);
    expect(result.capturedAt).toBeNull();
    expect(result.fiveHour).toBeNull();
    expect(result.sevenDay).toBeNull();
  });

  it('ignores an unknown window_minutes value', () => {
    const lines = [
      JSON.stringify(
        eventLine({
          timestamp: '2026-10-06T12:00:00.000Z',
          rateLimits: {
            limit_id: 'codex',
            primary: { used_percent: 10, window_minutes: 1440, resets_at: 1700000000 },
            secondary: null,
          },
        }),
      ),
    ];

    const result = parseRateLimitLines(lines);

    expect(result.fiveHour).toBeNull();
    expect(result.sevenDay).toBeNull();
  });
});

describe('readCodexUsage', () => {
  let tmpHome;

  beforeEach(() => {
    tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-usage-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  });

  function writeRollout(home, dateParts, fileName, lines) {
    const dir = path.join(home, '.codex', 'sessions', ...dateParts);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, fileName),
      lines.map((l) => JSON.stringify(l)).join('\n') + '\n',
    );
  }

  it('returns null when the sessions directory does not exist', () => {
    const result = readCodexUsage({ env: {}, home: tmpHome });
    expect(result).toBeNull();
  });

  it('merges windows found across two different files', () => {
    writeRollout(tmpHome, ['2026', '10', '05'], 'rollout-a.jsonl', [
      eventLine({
        timestamp: '2026-10-05T10:00:00.000Z',
        rateLimits: {
          limit_id: 'codex',
          primary: { used_percent: 10, window_minutes: 300, resets_at: 1700000000 },
          secondary: null,
        },
      }),
    ]);
    writeRollout(tmpHome, ['2026', '10', '06'], 'rollout-b.jsonl', [
      eventLine({
        timestamp: '2026-10-06T10:00:00.000Z',
        rateLimits: {
          limit_id: 'codex',
          primary: null,
          secondary: { used_percent: 40, window_minutes: 10080, resets_at: 1700500000 },
        },
      }),
    ]);

    const result = readCodexUsage({ env: {}, home: tmpHome });

    expect(result.fiveHour).toEqual({ pct: 10, resetsAt: 1700000000 });
    expect(result.sevenDay).toEqual({ pct: 40, resetsAt: 1700500000 });
  });

  it('respects CODEX_HOME over the default ~/.codex location', () => {
    const customHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-usage-custom-'));
    try {
      const customDir = path.join(customHome, 'sessions', '2026', '10', '06');
      fs.mkdirSync(customDir, { recursive: true });
      fs.writeFileSync(
        path.join(customDir, 'rollout-custom.jsonl'),
        JSON.stringify(
          eventLine({
            timestamp: '2026-10-06T10:00:00.000Z',
            rateLimits: {
              limit_id: 'codex',
              primary: { used_percent: 77, window_minutes: 300, resets_at: 1700000000 },
              secondary: null,
            },
          }),
        ) + '\n',
      );

      const result = readCodexUsage({ env: { CODEX_HOME: customHome }, home: tmpHome });

      expect(result.fiveHour).toEqual({ pct: 77, resetsAt: 1700000000 });
    } finally {
      fs.rmSync(customHome, { recursive: true, force: true });
    }
  });
});

describe('listRecentRolloutFiles', () => {
  const { listRecentRolloutFiles, MAX_FILES } = require('../../core/ai-usage-codex-fs');

  it('returns the newest files by mtime even when a day holds more than MAX_FILES', () => {
    const sessions = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-many-'));
    const dayDir = path.join(sessions, '2026', '10', '06');
    fs.mkdirSync(dayDir, { recursive: true });
    const fileCount = MAX_FILES * 3;
    const baseSeconds = 1_791_000_000;
    const created = [];
    for (let i = 0; i < fileCount; i += 1) {
      const name = `rollout-2026-10-06T${String(i).padStart(2, '0')}-00-00-x.jsonl`;
      const filePath = path.join(dayDir, name);
      fs.writeFileSync(filePath, '');
      fs.utimesSync(filePath, baseSeconds + i, baseSeconds + i);
      created.push(filePath);
    }
    const newestByMtime = created.slice(-MAX_FILES).reverse();

    const result = listRecentRolloutFiles(sessions);

    expect(result).toEqual(newestByMtime);
  });
});

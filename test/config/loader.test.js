'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

// Override homedir so CONFIG_PATH points to a temp dir
const testHome = path.join(os.tmpdir(), 'deadlineaura-loader-test-' + process.pid);
vi.spyOn(os, 'homedir').mockReturnValue(testHome);

const { loadConfig, saveConfig, deepMerge, CONFIG_PATH } = require('../../config/loader');
const { DEFAULTS } = require('../../config/defaults');

afterAll(() => {
  if (fs.existsSync(testHome)) {
    fs.rmSync(testHome, { recursive: true, force: true });
  }
});

beforeEach(() => {
  // Remove config file between tests
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
});

describe('deepMerge', () => {
  it('merges top-level scalar values', () => {
    const result = deepMerge({ a: 1, b: 2 }, { b: 99 });
    expect(result.a).toBe(1);
    expect(result.b).toBe(99);
  });

  it('deep-merges nested objects', () => {
    const target = { sync: { interval_minutes: 5, lookahead_hours: 72 } };
    const source = { sync: { interval_minutes: 10 } };
    const result = deepMerge(target, source);
    expect(result.sync.interval_minutes).toBe(10);
    expect(result.sync.lookahead_hours).toBe(72);
  });

  it('does not mutate the target', () => {
    const target = { a: { b: 1 } };
    const source = { a: { b: 2 } };
    deepMerge(target, source);
    expect(target.a.b).toBe(1);
  });

  it('overwrites arrays (does not merge them)', () => {
    const result = deepMerge({ arr: [1, 2, 3] }, { arr: [4, 5] });
    expect(result.arr).toEqual([4, 5]);
  });

  it('overwrites when source value is null (not recursed)', () => {
    const result = deepMerge({ nested: { a: 1 } }, { nested: null });
    expect(result.nested).toBeNull();
  });

  it('adds new keys from source', () => {
    const result = deepMerge({ a: 1 }, { b: 2 });
    expect(result.a).toBe(1);
    expect(result.b).toBe(2);
  });
});

describe('loadConfig', () => {
  it('returns DEFAULTS when config file does not exist', () => {
    const config = loadConfig();
    expect(config.sync.interval_minutes).toBe(DEFAULTS.sync.interval_minutes);
    expect(config.ai.enabled).toBe(DEFAULTS.ai.enabled);
  });

  it('merges user config over DEFAULTS when file exists', () => {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ sync: { interval_minutes: 15 } }), 'utf-8');

    const config = loadConfig();

    expect(config.sync.interval_minutes).toBe(15);
    // Defaults preserved for keys not in user config
    expect(config.sync.lookahead_hours).toBe(DEFAULTS.sync.lookahead_hours);
  });

  it('returns DEFAULTS when config file contains invalid JSON', () => {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, '{ invalid json', 'utf-8');

    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const config = loadConfig();

    expect(config.sync.interval_minutes).toBe(DEFAULTS.sync.interval_minutes);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns full config object with all expected sections', () => {
    const config = loadConfig();
    expect(config).toHaveProperty('sync');
    expect(config).toHaveProperty('sources');
    expect(config).toHaveProperty('engine');
    expect(config).toHaveProperty('ai');
    expect(config).toHaveProperty('wallpaper');
    expect(config).toHaveProperty('notifications');
  });
});

describe('saveConfig', () => {
  it('writes config to CONFIG_PATH as formatted JSON', () => {
    const testConfig = { ...DEFAULTS, sync: { interval_minutes: 20, lookahead_hours: 48 } };
    saveConfig(testConfig);

    expect(fs.existsSync(CONFIG_PATH)).toBe(true);
    const written = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    expect(written.sync.interval_minutes).toBe(20);
  });

  it('creates parent directories if missing', () => {
    if (fs.existsSync(path.dirname(CONFIG_PATH))) {
      fs.rmSync(path.dirname(CONFIG_PATH), { recursive: true, force: true });
    }

    saveConfig(DEFAULTS);
    expect(fs.existsSync(CONFIG_PATH)).toBe(true);
  });

  it('sets file permissions to 0o600', () => {
    saveConfig(DEFAULTS);
    const stat = fs.statSync(CONFIG_PATH);
    const mode = stat.mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('overwrites existing config file', () => {
    saveConfig({ ...DEFAULTS, sync: { interval_minutes: 5, lookahead_hours: 72 } });
    saveConfig({ ...DEFAULTS, sync: { interval_minutes: 99, lookahead_hours: 72 } });

    const written = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    expect(written.sync.interval_minutes).toBe(99);
  });
});

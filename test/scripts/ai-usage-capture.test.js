'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'ai-usage', 'claude-capture.py');

function makeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dlaura-capture-'));
}

function runCapture({ home, configDir, input }) {
  const env = { HOME: home, PATH: process.env.PATH };
  if (configDir !== undefined) {
    env.CLAUDE_CONFIG_DIR = configDir;
  }
  return spawnSync('python3', [SCRIPT], { input, env, timeout: 5000 });
}

function usageDir(home) {
  return path.join(home, '.local', 'share', 'deadlineaura', 'ai-usage');
}

function snapshotPath(home, account) {
  return path.join(usageDir(home), 'latest', `${account}.json`);
}

function readSnapshot(home, account) {
  return JSON.parse(fs.readFileSync(snapshotPath(home, account), 'utf8'));
}

function installChainCommand(home, configDir, command) {
  fs.mkdirSync(configDir, { recursive: true });
  const settingsPath = path.join(configDir, 'settings.json');
  fs.writeFileSync(
    settingsPath,
    JSON.stringify({ statusLine: { type: 'command', command: 'legacy-statusline' } }),
  );
  fs.mkdirSync(usageDir(home), { recursive: true, mode: 0o700 });
  const realSettings = fs.realpathSync(settingsPath);
  const captureJson = { v: 1, targets: { [realSettings]: { type: 'command', command } } };
  const captureJsonPath = path.join(usageDir(home), 'capture.json');
  fs.writeFileSync(captureJsonPath, JSON.stringify(captureJson));
  fs.chmodSync(captureJsonPath, 0o600);
}

const SLOW_CHAIN_UPPER_BOUND_MS = 4000;

describe('claude-capture.py capture mode', () => {
  it('writes a whitelisted snapshot from a valid payload and exits 0', () => {
    const home = makeHome();
    const payload = JSON.stringify({
      cwd: '/should/not/be/saved',
      session_id: 'abc-should-not-be-saved',
      rate_limits: {
        five_hour: { used_percentage: 69, resets_at: 1791324600 },
        seven_day: { used_percentage: 67, resets_at: 1791378000 },
      },
    });

    const result = runCapture({ home, configDir: path.join(home, 'profile'), input: payload });

    expect(result.status).toBe(0);
    const snap = readSnapshot(home, 'profile');
    expect(snap.v).toBe(1);
    expect(snap.account).toBe('profile');
    expect(snap.five_hour).toEqual({ pct: 69, resets_at: 1791324600 });
    expect(snap.seven_day).toEqual({ pct: 67, resets_at: 1791378000 });
    expect(snap.cwd).toBeUndefined();
    expect(snap.session_id).toBeUndefined();
    expect(typeof snap.captured_at).toBe('number');

    const mode = fs.statSync(snapshotPath(home, 'profile')).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(result.stdout.toString()).toBe('5h 69% | 7d 67%');
  });

  it('keeps the previous seven_day window when the new payload omits it', () => {
    const home = makeHome();
    const configDir = path.join(home, 'acct');
    const first = JSON.stringify({
      rate_limits: {
        five_hour: { used_percentage: 10, resets_at: 1000 },
        seven_day: { used_percentage: 50, resets_at: 2000 },
      },
    });
    expect(runCapture({ home, configDir, input: first }).status).toBe(0);

    const second = JSON.stringify({
      rate_limits: { five_hour: { used_percentage: 20, resets_at: 1100 } },
    });
    const result = runCapture({ home, configDir, input: second });
    expect(result.status).toBe(0);

    const snap = readSnapshot(home, 'acct');
    expect(snap.five_hour).toEqual({ pct: 20, resets_at: 1100 });
    expect(snap.seven_day).toEqual({ pct: 50, resets_at: 2000 });
  });

  it('converts resets_at expressed in milliseconds to seconds', () => {
    const home = makeHome();
    const configDir = path.join(home, 'ms');
    const payload = JSON.stringify({
      rate_limits: { five_hour: { used_percentage: 5, resets_at: 1791324600123 } },
    });
    expect(runCapture({ home, configDir, input: payload }).status).toBe(0);
    const snap = readSnapshot(home, 'ms');
    expect(snap.five_hour.resets_at).toBe(1791324600);
  });

  it('clamps a percentage above 100 down to 100', () => {
    const home = makeHome();
    const configDir = path.join(home, 'clamp');
    const payload = JSON.stringify({
      rate_limits: { five_hour: { used_percentage: 120, resets_at: 1000 } },
    });
    expect(runCapture({ home, configDir, input: payload }).status).toBe(0);
    expect(readSnapshot(home, 'clamp').five_hour.pct).toBe(100);
  });

  it('writes no snapshot and logs without the payload on malformed JSON', () => {
    const home = makeHome();
    const configDir = path.join(home, 'bad');
    const result = runCapture({ home, configDir, input: 'not json {{{' });
    expect(result.status).toBe(0);
    expect(fs.existsSync(snapshotPath(home, 'bad'))).toBe(false);

    const logPath = path.join(home, '.local', 'state', 'deadlineaura', 'ai-usage-capture.log');
    expect(fs.existsSync(logPath)).toBe(true);
    expect(fs.readFileSync(logPath, 'utf8')).not.toContain('not json');
  });

  it('writes no snapshot when CLAUDE_CONFIG_DIR has a path traversal segment', () => {
    const home = makeHome();
    // Built with a template literal, not path.join: path.join would
    // normalize away the ".." segment before the env var ever saw it.
    const configDir = `${home}/a/../x`;
    const payload = JSON.stringify({
      rate_limits: { five_hour: { used_percentage: 1, resets_at: 1 } },
    });
    const result = runCapture({ home, configDir, input: payload });
    expect(result.status).toBe(0);
    expect(fs.existsSync(snapshotPath(home, 'x'))).toBe(false);
  });

  it('writes no snapshot when CLAUDE_CONFIG_DIR basename has spaces', () => {
    const home = makeHome();
    const configDir = path.join(home, 'has space');
    const payload = JSON.stringify({
      rate_limits: { five_hour: { used_percentage: 1, resets_at: 1 } },
    });
    const result = runCapture({ home, configDir, input: payload });
    expect(result.status).toBe(0);
    expect(fs.existsSync(snapshotPath(home, 'has space'))).toBe(false);
  });

  it('forwards the chain command stdout byte-identical to stdin', () => {
    const home = makeHome();
    const configDir = path.join(home, 'chain');
    installChainCommand(home, configDir, 'cat');

    const payload = Buffer.from(
      '{"rate_limits":{"five_hour":{"used_percentage":1,"resets_at":1}}}',
    );
    const result = runCapture({ home, configDir, input: payload });
    expect(result.status).toBe(0);
    expect(result.stdout.equals(payload)).toBe(true);
  });

  it('forwards every line of a multi-line chain stdout', () => {
    const home = makeHome();
    const configDir = path.join(home, 'chain-multi');
    installChainCommand(home, configDir, "printf 'line1\\nline2\\n'");

    const payload = JSON.stringify({
      rate_limits: { five_hour: { used_percentage: 1, resets_at: 1 } },
    });
    const result = runCapture({ home, configDir, input: payload });
    expect(result.status).toBe(0);
    expect(result.stdout.toString()).toBe('line1\nline2\n');
  });

  it('falls back without waiting for a chain command that exceeds the timeout', () => {
    const home = makeHome();
    const configDir = path.join(home, 'chain-slow');
    installChainCommand(home, configDir, 'sleep 5');

    const payload = JSON.stringify({
      rate_limits: { five_hour: { used_percentage: 9, resets_at: 1 } },
    });
    const start = Date.now();
    const result = runCapture({ home, configDir, input: payload });
    const elapsed = Date.now() - start;
    expect(result.status).toBe(0);
    // The chain sleeps 5s: finishing well before that proves the 2s timeout fired.
    // The margin absorbs interpreter start-up under a loaded parallel test run.
    expect(elapsed).toBeLessThan(SLOW_CHAIN_UPPER_BOUND_MS);
    expect(result.stdout.toString()).toBe('5h 9%');
  });

  it('ignores a capture.json chain config with group-writable permissions', () => {
    const home = makeHome();
    const configDir = path.join(home, 'chain-insecure');
    installChainCommand(home, configDir, 'cat');
    fs.chmodSync(path.join(usageDir(home), 'capture.json'), 0o660);

    const payload = JSON.stringify({
      rate_limits: { five_hour: { used_percentage: 3, resets_at: 1 } },
    });
    const result = runCapture({ home, configDir, input: payload });
    expect(result.status).toBe(0);
    expect(result.stdout.toString()).toBe('5h 3%');
  });

  it('logs chain_config_unsafe (never the file content) for a world-writable capture.json', () => {
    const home = makeHome();
    const configDir = path.join(home, 'chain-unsafe-logged');
    installChainCommand(home, configDir, 'cat');
    fs.chmodSync(path.join(usageDir(home), 'capture.json'), 0o666);

    const payload = JSON.stringify({
      rate_limits: { five_hour: { used_percentage: 3, resets_at: 1 } },
    });
    const result = runCapture({ home, configDir, input: payload });
    expect(result.status).toBe(0);
    expect(result.stdout.toString()).toBe('5h 3%');

    const logPath = path.join(home, '.local', 'state', 'deadlineaura', 'ai-usage-capture.log');
    const logText = fs.readFileSync(logPath, 'utf8');
    expect(logText).toContain('ERROR chain_config_unsafe');
    expect(logText).not.toContain('cat');
  });

  it('logs chain_config_corrupted for an existing-but-invalid capture.json, and logs nothing when it is simply absent', () => {
    const home = makeHome();
    const configDir = path.join(home, 'chain-corrupted');
    const logPath = path.join(home, '.local', 'state', 'deadlineaura', 'ai-usage-capture.log');
    const payload = JSON.stringify({
      rate_limits: { five_hour: { used_percentage: 3, resets_at: 1 } },
    });

    // No capture.json at all: a missing chain config is the common case,
    // not an error, so nothing should be logged about it.
    const withoutConfig = runCapture({ home, configDir, input: payload });
    expect(withoutConfig.status).toBe(0);
    if (fs.existsSync(logPath)) {
      expect(fs.readFileSync(logPath, 'utf8')).not.toContain('chain_config');
    }

    // Now a capture.json exists, with safe permissions, but is not JSON.
    fs.mkdirSync(usageDir(home), { recursive: true, mode: 0o700 });
    const captureJsonPath = path.join(usageDir(home), 'capture.json');
    fs.writeFileSync(captureJsonPath, 'not valid json {{{');
    fs.chmodSync(captureJsonPath, 0o600);

    const withCorruptConfig = runCapture({ home, configDir, input: payload });
    expect(withCorruptConfig.status).toBe(0);
    expect(withCorruptConfig.stdout.toString()).toBe('5h 3%');

    const logText = fs.readFileSync(logPath, 'utf8');
    expect(logText).toContain('ERROR chain_config_corrupted');
    expect(logText).not.toContain('not valid json');
  });

  it('does not overwrite a snapshot target that is a symlink', () => {
    const home = makeHome();
    const configDir = path.join(home, 'symlink-acct');
    const latestDir = path.join(usageDir(home), 'latest');
    fs.mkdirSync(latestDir, { recursive: true, mode: 0o700 });
    const decoyTarget = path.join(home, 'decoy.json');
    fs.writeFileSync(decoyTarget, '{}');
    fs.symlinkSync(decoyTarget, path.join(latestDir, 'symlink-acct.json'));

    const payload = JSON.stringify({
      rate_limits: { five_hour: { used_percentage: 3, resets_at: 1 } },
    });
    const result = runCapture({ home, configDir, input: payload });
    expect(result.status).toBe(0);
    expect(fs.lstatSync(path.join(latestDir, 'symlink-acct.json')).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(decoyTarget, 'utf8')).toBe('{}');
  });

  it('exits 0 and does not hang when stdin exceeds 1 MiB', () => {
    const home = makeHome();
    const configDir = path.join(home, 'big');
    const bigPayload = Buffer.concat([
      Buffer.from('{"rate_limits":{"five_hour":{"used_percentage":1,"resets_at":1}},"padding":"'),
      Buffer.alloc(2 * 1024 * 1024, 'x'),
      Buffer.from('"}'),
    ]);
    const result = runCapture({ home, configDir, input: bigPayload });
    expect(result.status).toBe(0);
  });
});

describe('claude-capture.py fallback percentage rounding', () => {
  it('rounds half up like the wallpaper band, not to the nearest even integer', () => {
    const home = makeHome();
    const payload = JSON.stringify({
      rate_limits: {
        five_hour: { used_percentage: 68.5, resets_at: 1791324600 },
        seven_day: { used_percentage: 67.4, resets_at: 1791378000 },
      },
    });

    const result = runCapture({ home, configDir: path.join(home, 'acc'), input: payload });

    expect(result.stdout.toString()).toBe('5h 69% | 7d 67%');
  });
});

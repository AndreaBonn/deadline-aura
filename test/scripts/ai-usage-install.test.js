'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'ai-usage', 'claude-capture.py');

function makeHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dlaura-install-'));
}

function run(home, args) {
  return spawnSync('python3', [SCRIPT, ...args], {
    env: { HOME: home, PATH: process.env.PATH },
    timeout: 5000,
  });
}

function parseStdout(result) {
  return JSON.parse(result.stdout.toString());
}

function claudeSettingsPath(home) {
  return path.join(home, '.claude', 'settings.json');
}

const ORIGINAL_SETTINGS = {
  model: 'claude-x',
  statusLine: {
    type: 'command',
    command: '/usr/bin/python3 ~/.claude/scripts/statusline.py',
    padding: 0,
  },
  otherKey: { nested: true, list: [1, 2, 3] },
};

function setupRealSettingsWithCloakProfiles(home) {
  const claudeDir = path.join(home, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  const realPath = claudeSettingsPath(home);
  fs.writeFileSync(realPath, JSON.stringify(ORIGINAL_SETTINGS, null, 2));

  const profilesDir = path.join(home, '.cloak', 'profiles');
  for (const name of ['a', 'b']) {
    const profileDir = path.join(profilesDir, name);
    fs.mkdirSync(profileDir, { recursive: true });
    fs.symlinkSync(realPath, path.join(profileDir, 'settings.json'));
  }
  return realPath;
}

function backupFiles(home) {
  const backupsDir = path.join(home, '.local', 'share', 'deadlineaura', 'backups');
  if (!fs.existsSync(backupsDir)) {
    return [];
  }
  return fs.readdirSync(backupsDir);
}

describe('claude-capture.py install/uninstall/status', () => {
  it('installs once across symlinked cloak profiles and is idempotent on a second run', () => {
    const home = makeHome();
    const realPath = setupRealSettingsWithCloakProfiles(home);

    const first = run(home, ['install']);
    expect(first.status).toBe(0);
    const firstBody = parseStdout(first);
    expect(firstBody.ok).toBe(true);
    expect(firstBody.changed.length).toBe(1);

    const afterFirst = JSON.parse(fs.readFileSync(realPath, 'utf8'));
    expect(afterFirst.statusLine.type).toBe('command');
    expect(afterFirst.statusLine.command).toBe(fs.realpathSync(SCRIPT));
    expect(afterFirst.statusLine.padding).toBe(0);
    expect(afterFirst.otherKey).toEqual({ nested: true, list: [1, 2, 3] });
    expect(Object.keys(afterFirst)).toEqual(Object.keys(ORIGINAL_SETTINGS));

    const second = run(home, ['install']);
    expect(second.status).toBe(0);
    const secondBody = parseStdout(second);
    expect(secondBody.changed.length).toBe(0);
    expect(secondBody.unchanged.length).toBe(1);

    expect(backupFiles(home).length).toBe(1);

    for (const name of ['a', 'b']) {
      const profilePath = path.join(home, '.cloak', 'profiles', name, 'settings.json');
      expect(fs.lstatSync(profilePath).isSymbolicLink()).toBe(true);
    }
  });

  it('restores the original statusLine byte-for-byte on uninstall', () => {
    const home = makeHome();
    const realPath = setupRealSettingsWithCloakProfiles(home);

    run(home, ['install']);
    const uninstallResult = run(home, ['uninstall']);
    expect(uninstallResult.status).toBe(0);

    const restored = JSON.parse(fs.readFileSync(realPath, 'utf8'));
    expect(restored).toEqual(ORIGINAL_SETTINGS);
  });

  it('refuses to modify any file when settings.json is invalid JSON', () => {
    const home = makeHome();
    const claudeDir = path.join(home, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    const realPath = claudeSettingsPath(home);
    fs.writeFileSync(realPath, '{ not valid json');
    const before = fs.readFileSync(realPath, 'utf8');

    const result = run(home, ['install']);
    expect(result.status).toBe(1);
    expect(fs.readFileSync(realPath, 'utf8')).toBe(before);
    expect(backupFiles(home).length).toBe(0);
  });

  it('does not touch a statusLine the user changed after install, and warns', () => {
    const home = makeHome();
    const realPath = setupRealSettingsWithCloakProfiles(home);
    run(home, ['install']);

    const manual = JSON.parse(fs.readFileSync(realPath, 'utf8'));
    manual.statusLine = { type: 'command', command: 'user-chosen-statusline' };
    fs.writeFileSync(realPath, JSON.stringify(manual, null, 2));

    const result = run(home, ['uninstall']);
    expect(result.status).toBe(0);
    const body = parseStdout(result);
    expect(body.warnings.length).toBeGreaterThan(0);

    const after = JSON.parse(fs.readFileSync(realPath, 'utf8'));
    expect(after.statusLine.command).toBe('user-chosen-statusline');
  });

  it('reports status without modifying any file', () => {
    const home = makeHome();
    const realPath = setupRealSettingsWithCloakProfiles(home);
    const before = fs.readFileSync(realPath, 'utf8');

    const result = run(home, ['status']);
    expect(result.status).toBe(0);
    expect(parseStdout(result).installed).toBe(false);

    expect(fs.readFileSync(realPath, 'utf8')).toBe(before);
    expect(fs.existsSync(path.join(home, '.local', 'share', 'deadlineaura', 'backups'))).toBe(
      false,
    );

    run(home, ['install']);
    const afterInstall = run(home, ['status']);
    expect(parseStdout(afterInstall).installed).toBe(true);
  });

  it('keeps at most MAX_BACKUPS=10 backups after repeated install/uninstall cycles', () => {
    const home = makeHome();
    setupRealSettingsWithCloakProfiles(home);

    for (let i = 0; i < 13; i += 1) {
      run(home, ['install']);
      run(home, ['uninstall']);
    }

    expect(backupFiles(home).length).toBeLessThanOrEqual(10);
  });
});

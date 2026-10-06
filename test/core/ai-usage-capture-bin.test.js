'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  sourceDir,
  binDir,
  syncCaptureBin,
  runCaptureCommand,
} = require('../../core/ai-usage-capture-bin');

const REAL_SOURCE_DIR = path.join(__dirname, '..', '..', 'scripts', 'ai-usage');

function makeTmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFixtureSource(dir, overrides = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const files = {
    'claude-capture.py': overrides['claude-capture.py'] || '# claude-capture v1\n',
    'capture_install.py': overrides['capture_install.py'] || '# capture_install v1\n',
    'ai_usage_common.py': overrides['ai_usage_common.py'] || '# ai_usage_common v1\n',
  };
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), content);
  }
  return dir;
}

describe('sourceDir', () => {
  it('resolves to resourcesPath/ai-usage when packaged', () => {
    const result = sourceDir({
      isPackaged: true,
      resourcesPath: '/opt/DeadlineAura/resources',
      appDir: '/ignored',
    });
    expect(result).toBe(path.join('/opt/DeadlineAura/resources', 'ai-usage'));
  });

  it('resolves to <appDir>/scripts/ai-usage in dev', () => {
    const result = sourceDir({ isPackaged: false, resourcesPath: '/ignored', appDir: '/app' });
    expect(result).toBe(path.join('/app', 'scripts', 'ai-usage'));
  });
});

describe('binDir', () => {
  it('resolves to <home>/.local/share/deadlineaura/bin', () => {
    expect(binDir('/home/x')).toBe(path.join('/home/x', '.local', 'share', 'deadlineaura', 'bin'));
  });
});

describe('syncCaptureBin', () => {
  it('copies all files on first sync and sets the right modes', () => {
    const source = writeFixtureSource(makeTmpDir('dlaura-src-'));
    const dest = path.join(makeTmpDir('dlaura-dest-'), 'bin');

    const result = syncCaptureBin({ source, dest });

    expect(result.copied.sort()).toEqual(
      ['ai_usage_common.py', 'capture_install.py', 'claude-capture.py'].sort(),
    );
    expect(result.unchanged).toEqual([]);
    expect(fs.statSync(dest).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(dest, 'claude-capture.py')).mode & 0o777).toBe(0o700);
    expect(fs.statSync(path.join(dest, 'capture_install.py')).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.join(dest, 'ai_usage_common.py')).mode & 0o777).toBe(0o600);
  });

  it('copies nothing on a second sync when sources are unchanged', () => {
    const source = writeFixtureSource(makeTmpDir('dlaura-src-'));
    const dest = path.join(makeTmpDir('dlaura-dest-'), 'bin');
    syncCaptureBin({ source, dest });

    const second = syncCaptureBin({ source, dest });

    expect(second.copied).toEqual([]);
    expect(second.unchanged.sort()).toEqual(
      ['ai_usage_common.py', 'capture_install.py', 'claude-capture.py'].sort(),
    );
  });

  it('re-copies only the file whose source changed', () => {
    const source = writeFixtureSource(makeTmpDir('dlaura-src-'));
    const dest = path.join(makeTmpDir('dlaura-dest-'), 'bin');
    syncCaptureBin({ source, dest });

    fs.writeFileSync(path.join(source, 'capture_install.py'), '# capture_install v2\n');
    const result = syncCaptureBin({ source, dest });

    expect(result.copied).toEqual(['capture_install.py']);
    expect(result.unchanged.sort()).toEqual(['ai_usage_common.py', 'claude-capture.py'].sort());
  });

  it('refuses to write anything when the destination dir is a symlink', () => {
    const source = writeFixtureSource(makeTmpDir('dlaura-src-'));
    const elsewhere = makeTmpDir('dlaura-elsewhere-');
    const destParent = makeTmpDir('dlaura-dest-');
    const dest = path.join(destParent, 'bin');
    fs.symlinkSync(elsewhere, dest);

    expect(() => syncCaptureBin({ source, dest })).toThrow(/symlink/);
    expect(fs.readdirSync(elsewhere)).toEqual([]);
  });

  it('refuses to write anything when one target file is a symlink', () => {
    const source = writeFixtureSource(makeTmpDir('dlaura-src-'));
    const dest = path.join(makeTmpDir('dlaura-dest-'), 'bin');
    fs.mkdirSync(dest, { recursive: true, mode: 0o700 });
    const decoy = path.join(makeTmpDir('dlaura-decoy-'), 'decoy.py');
    fs.writeFileSync(decoy, '# decoy\n');
    fs.symlinkSync(decoy, path.join(dest, 'claude-capture.py'));

    expect(() => syncCaptureBin({ source, dest })).toThrow(/symlink/);
    expect(fs.existsSync(path.join(dest, 'capture_install.py'))).toBe(false);
  });
});

describe('runCaptureCommand', () => {
  it('invokes python3 -IS <binDir>/claude-capture.py <action> without a shell', async () => {
    const home = makeTmpDir('dlaura-home-');
    const calls = [];
    const fakeExecFile = (file, args, options, callback) => {
      calls.push({ file, args, options });
      callback(null, '{"ok":true}', '');
    };

    const result = await runCaptureCommand('status', { home, execFile: fakeExecFile });

    expect(result).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].file).toBe('/usr/bin/python3');
    expect(calls[0].args).toEqual(['-IS', path.join(binDir(home), 'claude-capture.py'), 'status']);
    expect(calls[0].options.env.HOME).toBe(home);
    expect('shell' in calls[0].options).toBe(false);
  });

  it('maps an ENOENT spawn error to python3_missing', async () => {
    const fakeExecFile = (file, args, options, callback) => {
      const err = new Error('spawn /usr/bin/python3 ENOENT');
      err.code = 'ENOENT';
      callback(err, '', '');
    };

    const result = await runCaptureCommand('install', { home: '/x', execFile: fakeExecFile });

    expect(result).toEqual({ ok: false, error: 'python3_missing' });
  });

  it('maps a non-zero exit to command_failed with truncated stderr detail', async () => {
    const fakeExecFile = (file, args, options, callback) => {
      const err = new Error('exit 1');
      err.code = 1;
      callback(err, '', 'boom');
    };

    const result = await runCaptureCommand('uninstall', { home: '/x', execFile: fakeExecFile });

    expect(result).toEqual({ ok: false, error: 'command_failed', detail: 'boom' });
  });

  it('maps invalid JSON on stdout to command_failed', async () => {
    const fakeExecFile = (file, args, options, callback) => {
      callback(null, 'not json', 'stderr text');
    };

    const result = await runCaptureCommand('status', { home: '/x', execFile: fakeExecFile });

    expect(result).toEqual({ ok: false, error: 'command_failed', detail: 'stderr text' });
  });

  it('throws synchronously on an unknown action', () => {
    expect(() => runCaptureCommand('delete', { home: '/x' })).toThrow(/invalid capture action/);
  });
});

describe('syncCaptureBin + runCaptureCommand integration (real scripts)', () => {
  it('syncs the real ai-usage scripts and reports not-installed status', async () => {
    const home = makeTmpDir('dlaura-realhome-');

    const syncResult = syncCaptureBin({ source: REAL_SOURCE_DIR, dest: binDir(home) });
    expect(syncResult.copied.sort()).toEqual(
      ['ai_usage_common.py', 'capture_install.py', 'claude-capture.py'].sort(),
    );

    const result = await runCaptureCommand('status', { home });
    expect(result).toEqual({ installed: false, targets: {} });
  });
});

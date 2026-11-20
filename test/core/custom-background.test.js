'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadImage } = require('canvas');
const {
  importCustomBackground,
  inspectCustomBackground,
  describeCustomBackground,
  MAX_CUSTOM_BACKGROUND_BYTES,
} = require('../../core/custom-background');

const fixtures = path.join(__dirname, '../fixtures/backgrounds');
const fixture = (name) => path.join(fixtures, name);

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'custom-background-'));
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir);
  return { root, dataDir };
}

function cleanup(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

describe('custom background import', () => {
  it('copies an uppercase JPG with identical bytes and private permissions', async () => {
    const { root, dataDir } = setup();
    try {
      const source = path.join(root, 'foto.JPG');
      fs.copyFileSync(fixture('small.jpg'), source);
      expect(await importCustomBackground(source, { dataDir, loadImage })).toEqual({
        ok: true,
        file: 'custom-background.jpg',
        width: 64,
        height: 48,
      });
      const target = path.join(dataDir, 'custom-background.jpg');
      expect(fs.readFileSync(target)).toEqual(fs.readFileSync(source));
      expect(fs.statSync(target).mode & 0o777).toBe(0o600);
    } finally {
      cleanup(root);
    }
  });

  it('rejects unsupported GIF and WebP extensions while accepting PNG', async () => {
    const { root, dataDir } = setup();
    try {
      const gif = path.join(root, 'image.gif');
      fs.copyFileSync(fixture('fake-gif.png'), gif);
      expect(await importCustomBackground(gif, { dataDir, loadImage })).toEqual({
        ok: false,
        error: 'UNSUPPORTED_FORMAT',
      });
      expect(await importCustomBackground(fixture('small.webp'), { dataDir, loadImage })).toEqual({
        ok: false,
        error: 'UNSUPPORTED_FORMAT',
      });
      expect(fs.readdirSync(dataDir)).toEqual([]);
      expect((await importCustomBackground(fixture('small.png'), { dataDir, loadImage })).ok).toBe(
        true,
      );
    } finally {
      cleanup(root);
    }
  });

  it('rejects files above the byte limit and checks the exact limit', async () => {
    const { root, dataDir } = setup();
    try {
      const source = path.join(root, 'large.png');
      fs.writeFileSync(source, '');
      fs.truncateSync(source, MAX_CUSTOM_BACKGROUND_BYTES + 1);
      expect(await importCustomBackground(source, { dataDir, loadImage })).toEqual({
        ok: false,
        error: 'TOO_LARGE',
      });
      expect(fs.readdirSync(dataDir)).toEqual([]);
      fs.truncateSync(source, MAX_CUSTOM_BACKGROUND_BYTES);
      expect(await importCustomBackground(source, { dataDir, loadImage })).toEqual({
        ok: false,
        error: 'UNREADABLE',
      });
      expect(fs.readdirSync(dataDir)).toEqual([]);
    } finally {
      cleanup(root);
    }
  });

  it('rejects invalid magic before decoding, while decoding a real PNG', async () => {
    const { root, dataDir } = setup();
    try {
      const spy = vi.fn(loadImage);
      const text = path.join(root, 'text.png');
      fs.writeFileSync(text, 'not an image');
      for (const source of [text, fixture('fake-gif.png'), fixture('fake-svg.png')]) {
        expect(await importCustomBackground(source, { dataDir, loadImage: spy })).toEqual({
          ok: false,
          error: 'UNREADABLE',
        });
        expect(fs.readdirSync(dataDir)).toEqual([]);
      }
      expect(spy).not.toHaveBeenCalled();
      expect(
        (await importCustomBackground(fixture('small.png'), { dataDir, loadImage: spy })).ok,
      ).toBe(true);
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      cleanup(root);
    }
  });

  it('rejects excessive pixel counts before decoding and accepts a small image', async () => {
    const { root, dataDir } = setup();
    try {
      const spy = vi.fn(loadImage);
      expect(
        await importCustomBackground(fixture('huge.png'), { dataDir, loadImage: spy }),
      ).toEqual({ ok: false, error: 'TOO_MANY_PIXELS' });
      expect(spy).not.toHaveBeenCalled();
      expect(fs.readdirSync(dataDir)).toEqual([]);
      expect(
        (await importCustomBackground(fixture('small.png'), { dataDir, loadImage: spy })).ok,
      ).toBe(true);
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      cleanup(root);
    }
  });

  it('replaces only the previous allowed image and removes orphan temporary files', async () => {
    const { root, dataDir } = setup();
    try {
      fs.writeFileSync(path.join(dataDir, 'custom-background.jpg.tmp'), 'orphan');
      fs.writeFileSync(path.join(dataDir, 'custom-background-other.png'), 'keep');
      await importCustomBackground(fixture('small.png'), { dataDir, loadImage });
      await importCustomBackground(fixture('small.jpg'), { dataDir, loadImage });
      expect(fs.readdirSync(dataDir).sort()).toEqual([
        'custom-background-other.png',
        'custom-background.jpg',
      ]);
      await importCustomBackground(fixture('small.png'), { dataDir, loadImage });
      expect(fs.readdirSync(dataDir).sort()).toEqual([
        'custom-background-other.png',
        'custom-background.png',
      ]);
    } finally {
      cleanup(root);
    }
  });

  it('preserves the existing image after decoding or copy failure', async () => {
    const { root, dataDir } = setup();
    try {
      await importCustomBackground(fixture('small.png'), { dataDir, loadImage });
      const before = fs.readFileSync(path.join(dataDir, 'custom-background.png'));
      const failDecode = vi.fn().mockRejectedValue(new Error('/private/path'));
      expect(
        await importCustomBackground(fixture('small.png'), { dataDir, loadImage: failDecode }),
      ).toEqual({ ok: false, error: 'UNREADABLE' });
      expect(
        await importCustomBackground(path.join(root, 'missing.png'), { dataDir, loadImage }),
      ).toEqual({ ok: false, error: 'UNREADABLE' });
      expect(fs.readFileSync(path.join(dataDir, 'custom-background.png'))).toEqual(before);
      expect(fs.readdirSync(dataDir)).toEqual(['custom-background.png']);
    } finally {
      cleanup(root);
    }
  });
});

describe('custom background import diagnostics', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function throwingRm(shouldThrow) {
    const realRm = fs.rmSync;
    return vi.spyOn(fs, 'rmSync').mockImplementation((target, options) => {
      if (shouldThrow(String(target))) {
        throw Object.assign(new Error('rm denied'), { code: 'EACCES' });
      }
      return realRm(target, options);
    });
  }

  it('keeps ok:true and warns when the final temporary cleanup throws', async () => {
    const { root, dataDir } = setup();
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const imported = path.join(dataDir, 'custom-background.png');
      throwingRm((target) => target.endsWith('.tmp') && fs.existsSync(imported));
      const result = await importCustomBackground(fixture('small.png'), { dataDir, loadImage });
      expect(result).toEqual({ ok: true, file: 'custom-background.png', width: 64, height: 48 });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[wallpaper]'),
        'EACCES',
        'rm denied',
      );
    } finally {
      cleanup(root);
    }
  });

  it('does not warn when an import succeeds without errors', async () => {
    const { root, dataDir } = setup();
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await importCustomBackground(fixture('small.png'), { dataDir, loadImage });
      expect(result.ok).toBe(true);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      cleanup(root);
    }
  });

  it('warns with the error code and still returns COPY_FAILED when the copy fails', async () => {
    const { root, dataDir } = setup();
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(fs, 'writeFileSync').mockImplementationOnce(() => {
        throw Object.assign(new Error('no space left'), { code: 'ENOSPC' });
      });
      const result = await importCustomBackground(fixture('small.png'), { dataDir, loadImage });
      expect(result).toEqual({ ok: false, error: 'COPY_FAILED' });
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('copy'), 'ENOSPC', 'no space left');
    } finally {
      cleanup(root);
    }
  });

  it('warns and returns UNREADABLE when decoding the copy fails', async () => {
    const { root, dataDir } = setup();
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const failDecode = vi.fn().mockRejectedValue(new Error('bad image'));
      const result = await importCustomBackground(fixture('small.png'), {
        dataDir,
        loadImage: failDecode,
      });
      expect(result).toEqual({ ok: false, error: 'UNREADABLE' });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('validation'),
        'Error',
        'bad image',
      );
    } finally {
      cleanup(root);
    }
  });

  it('does not turn a readable source into UNREADABLE when stale .tmp cleanup throws', async () => {
    const { root, dataDir } = setup();
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      throwingRm((target) => target.endsWith('.tmp'));
      const result = await importCustomBackground(fixture('small.png'), { dataDir, loadImage });
      expect(result.ok).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('[wallpaper]'),
        'EACCES',
        'rm denied',
      );
    } finally {
      cleanup(root);
    }
  });

  it('still reports UNREADABLE and warns when the source itself cannot be read', async () => {
    const { root, dataDir } = setup();
    try {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await importCustomBackground(path.join(root, 'missing.png'), {
        dataDir,
        loadImage,
      });
      expect(result).toEqual({ ok: false, error: 'UNREADABLE' });
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('source'),
        'ENOENT',
        expect.any(String),
      );
    } finally {
      cleanup(root);
    }
  });
});

describe('custom background inspection', () => {
  it('rejects symlinks and reads the regular image dimensions', () => {
    const { root } = setup();
    try {
      const link = path.join(root, 'link.png');
      fs.symlinkSync(fixture('small.png'), link);
      expect(inspectCustomBackground(link)).toEqual({ ok: false, error: 'SYMLINK' });
      expect(inspectCustomBackground(fixture('small.png'))).toEqual({
        ok: true,
        width: 64,
        height: 48,
      });
    } finally {
      cleanup(root);
    }
  });

  it('describes none, missing, valid and corrupt images', () => {
    const { root, dataDir } = setup();
    try {
      expect(describeCustomBackground(null, { dataDir })).toEqual({
        state: 'none',
        file: null,
        width: null,
        height: null,
      });
      expect(describeCustomBackground('custom-background.png', { dataDir })).toEqual({
        state: 'missing',
        file: 'custom-background.png',
        width: null,
        height: null,
      });
      fs.copyFileSync(fixture('small.png'), path.join(dataDir, 'custom-background.png'));
      expect(describeCustomBackground('custom-background.png', { dataDir })).toEqual({
        state: 'ok',
        file: 'custom-background.png',
        width: 64,
        height: 48,
      });
      fs.writeFileSync(path.join(dataDir, 'custom-background.png'), 'broken');
      expect(describeCustomBackground('custom-background.png', { dataDir })).toEqual({
        state: 'unreadable',
        file: 'custom-background.png',
        width: null,
        height: null,
      });
    } finally {
      cleanup(root);
    }
  });
});

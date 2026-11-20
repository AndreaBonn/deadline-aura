'use strict';

const path = require('path');
const { planBackground, CUSTOM_VEIL_ALPHA } = require('../../core/wallpaper-background');

describe('planBackground', () => {
  it.each([
    [0.1, 'calmo.png'],
    [0.95, 'critico.png'],
  ])('selects the dynamic photo for score %s', (score, name) => {
    expect(planBackground({ mode: 'dynamic', score })).toEqual({
      kind: 'dynamic',
      file: expect.stringMatching(new RegExp(`${name.replace('.', '\\.')}$$`)),
      veil: 'tint',
    });
  });

  it('plans a gradient without a photo', () => {
    expect(planBackground({ mode: 'gradient', score: 0.1 })).toEqual({
      kind: 'gradient',
      file: null,
      veil: 'none',
    });
  });

  it('plans the custom image with a neutral veil', () => {
    const customPath = path.join('/tmp', 'my-background.png');
    expect(planBackground({ mode: 'custom', customPath, score: 0.1 })).toEqual({
      kind: 'custom',
      file: customPath,
      veil: 'neutral',
    });
    expect(CUSTOM_VEIL_ALPHA).toBe(0.15);
  });

  it('falls back to the dynamic plan when the custom path is missing', () => {
    expect(planBackground({ mode: 'custom', score: 0.1 })).toEqual({
      ...planBackground({ mode: 'dynamic', score: 0.1 }),
      fallbackReason: 'NOT_SET',
    });
  });

  it.each([undefined, 'unknown'])('uses dynamic for mode %s', (mode) => {
    expect(planBackground({ mode, score: 0.1 })).toEqual(
      planBackground({ mode: 'dynamic', score: 0.1 }),
    );
    expect(planBackground({ mode, score: 0.1 }).file).toMatch(/calmo\.png$/);
  });
});

describe('custom background inspection', () => {
  it('rejects symlinks and oversized headers before decoding, while decoding a valid image', async () => {
    const fs = require('fs');
    const os = require('os');
    const { loadBackground } = require('../../core/wallpaper-background');
    const fixtures = path.join(__dirname, '../fixtures/backgrounds');
    const valid = path.join(fixtures, 'small.png');
    const huge = path.join(fixtures, 'huge.png');
    const link = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wallpaper-link-')), 'link.png');
    fs.symlinkSync(valid, link);
    const loadImage = vi.fn(async (file) => ({ file }));
    const log = { warn: vi.fn() };
    for (const [file, reason] of [
      [link, 'SYMLINK'],
      [huge, 'TOO_MANY_PIXELS'],
    ]) {
      const result = await loadBackground(
        { kind: 'custom', file, veil: 'neutral' },
        { loadImage, log, score: 0.1 },
      );
      expect(result.veil).toBe('tint');
      expect(loadImage).not.toHaveBeenCalledWith(file);
      expect(log.warn).toHaveBeenCalledWith(expect.stringContaining(reason));
    }
    expect(
      await loadBackground(
        { kind: 'custom', file: valid, veil: 'neutral' },
        { loadImage, log, score: 0.1 },
      ),
    ).toEqual({ image: { file: valid }, veil: 'neutral' });
    expect(loadImage).toHaveBeenCalledWith(valid);
  });
});

describe('dynamic background loading diagnostics', () => {
  const { loadBackground } = require('../../core/wallpaper-background');
  const plan = { kind: 'dynamic', file: '/photos/calmo.png', veil: 'tint' };

  it('warns with the file and message, and returns no image, when the photo cannot load', async () => {
    const log = { warn: vi.fn() };
    const loadImage = vi.fn().mockRejectedValue(new Error('Image given has not completed loading'));
    expect(await loadBackground(plan, { loadImage, log, score: 0.1 })).toEqual({
      image: null,
      veil: 'tint',
    });
    expect(log.warn).toHaveBeenCalledWith(
      expect.stringContaining('dynamic background unavailable'),
      '/photos/calmo.png',
      'Image given has not completed loading',
    );
  });

  it('does not warn when the dynamic photo loads', async () => {
    const log = { warn: vi.fn() };
    const loadImage = vi.fn(async (file) => ({ file }));
    expect(await loadBackground(plan, { loadImage, log, score: 0.1 })).toEqual({
      image: { file: '/photos/calmo.png' },
      veil: 'tint',
    });
    expect(log.warn).not.toHaveBeenCalled();
  });
});

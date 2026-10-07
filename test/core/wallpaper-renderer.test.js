'use strict';

const fs = require('fs');

const path = require('path');
const {
  getBackgroundFile,
  BACKGROUNDS_DIR,
  resolveUnpackedDir,
} = require('../../core/wallpaper-renderer');

describe('wallpaper-renderer getBackgroundFile', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null when no background file exists for the selected band', () => {
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const missing = getBackgroundFile(0.1);
    existsSpy.mockImplementation((file) => file === path.join(BACKGROUNDS_DIR, 'calmo.png'));
    const available = getBackgroundFile(0.1);

    expect({ missing, available }).toEqual({
      missing: null,
      available: path.join(BACKGROUNDS_DIR, 'calmo.png'),
    });
  });

  it.each([
    [0.1, 'calmo'],
    [0.3, 'normale'],
    [0.5, 'attenzione'],
    [0.7, 'urgente'],
    [0.9, 'critico'],
    [1, 'critico'],
    [0, 'calmo'],
  ])('selects %s score background named %s', (score, band) => {
    vi.spyOn(fs, 'existsSync').mockImplementation((file) => file.endsWith('.png'));

    const result = getBackgroundFile(score);

    expect(result).toBe(path.join(BACKGROUNDS_DIR, band + '.png'));
  });

  it('exports BACKGROUNDS_DIR as an absolute path string', () => {
    expect(typeof BACKGROUNDS_DIR).toBe('string');
    expect(BACKGROUNDS_DIR.startsWith('/')).toBe(true);
    expect(BACKGROUNDS_DIR).toContain('assets');
    expect(BACKGROUNDS_DIR).toContain('backgrounds');
  });
});

describe('wallpaper-renderer — resolveUnpackedDir', () => {
  const sep = path.sep;

  it('redirects an asar-packed path to app.asar.unpacked', () => {
    const packed = `/opt/DeadlineAura/resources/app.asar${sep}assets${sep}backgrounds`;
    const expected = `/opt/DeadlineAura/resources/app.asar.unpacked${sep}assets${sep}backgrounds`;
    expect(resolveUnpackedDir(packed)).toBe(expected);
  });

  it('leaves a plain dev path unchanged (no asar segment)', () => {
    const dev = `/home/dev/deadline-aura${sep}assets${sep}backgrounds`;
    expect(resolveUnpackedDir(dev)).toBe(dev);
  });

  it('does not rewrite a path already pointing at app.asar.unpacked', () => {
    const unpacked = `/opt/app/resources/app.asar.unpacked${sep}assets`;
    expect(resolveUnpackedDir(unpacked)).toBe(unpacked);
  });
});

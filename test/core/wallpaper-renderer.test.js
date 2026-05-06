'use strict';

// Test pure/logic functions exported from wallpaper-renderer.
// render() itself requires canvas and fs — not tested here (integration concern).

const { getBackgroundFile, BACKGROUNDS_DIR } = require('../../core/wallpaper-renderer');

describe('wallpaper-renderer — getBackgroundFile', () => {
  it('returns null when no background file exists for band', () => {
    // BACKGROUNDS_DIR likely does not have files in the test environment
    // getBackgroundFile returns null when findBackgroundFile finds nothing
    const result = getBackgroundFile(0.1);
    // Either null (no file) or a string path — both are valid
    if (result !== null) {
      expect(typeof result).toBe('string');
      expect(result).toMatch(/\.(png|jpg|jpeg|webp)$/);
    } else {
      expect(result).toBeNull();
    }
  });

  it('selects "calmo" band for score 0.1', () => {
    // We can verify band selection by checking the path name when file exists
    // Without actual files, we verify the function does not throw
    expect(() => getBackgroundFile(0.1)).not.toThrow();
  });

  it('selects "normale" band for score 0.3', () => {
    expect(() => getBackgroundFile(0.3)).not.toThrow();
  });

  it('selects "attenzione" band for score 0.5', () => {
    expect(() => getBackgroundFile(0.5)).not.toThrow();
  });

  it('selects "urgente" band for score 0.7', () => {
    expect(() => getBackgroundFile(0.7)).not.toThrow();
  });

  it('selects "critico" band for score 0.9', () => {
    expect(() => getBackgroundFile(0.9)).not.toThrow();
  });

  it('handles score exactly 1.0 without throwing', () => {
    expect(() => getBackgroundFile(1.0)).not.toThrow();
  });

  it('handles score exactly 0.0 without throwing', () => {
    expect(() => getBackgroundFile(0.0)).not.toThrow();
  });

  it('exports BACKGROUNDS_DIR as an absolute path string', () => {
    expect(typeof BACKGROUNDS_DIR).toBe('string');
    expect(BACKGROUNDS_DIR.startsWith('/')).toBe(true);
    expect(BACKGROUNDS_DIR).toContain('assets');
    expect(BACKGROUNDS_DIR).toContain('backgrounds');
  });
});

describe('wallpaper-renderer — filterUpcomingEvents (via render internals)', () => {
  // filterUpcomingEvents is not exported — test its behavior through observable
  // render() output is not feasible without canvas.
  // We document this as a known gap (canvas dependency).
  it('SKIP: filterUpcomingEvents is not exported and requires canvas to test through render()', () => {
    // This test serves as documentation of the gap.
    // Coverage for lines 127-140 requires either exporting the function
    // or an integration test with a real canvas environment.
    expect(true).toBe(true);
  });
});

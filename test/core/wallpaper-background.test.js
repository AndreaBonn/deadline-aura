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

const { mapScoreToColor, hslToHex } = require('../../core/color-mapper');

describe('color-mapper', () => {
  describe('mapScoreToColor', () => {
    it('returns calmo label and hue 160 for score 0.0', () => {
      const result = mapScoreToColor(0.0);
      expect(result.hsl.h).toBe(160);
      expect(result.label).toBe('calmo');
    });

    it('returns critico label and hue 0 for score 1.0', () => {
      const result = mapScoreToColor(1.0);
      expect(result.hsl.h).toBe(0);
      expect(result.label).toBe('critico');
    });

    it('interpolates linearly within a band', () => {
      const low = mapScoreToColor(0.2);
      const mid = mapScoreToColor(0.3);
      const high = mapScoreToColor(0.4);

      expect(mid.hsl.h).toBeGreaterThan(high.hsl.h);
      expect(mid.hsl.h).toBeLessThan(low.hsl.h);
    });

    it('returns valid hex string for any score', () => {
      const scores = [0, 0.1, 0.25, 0.5, 0.75, 0.99, 1.0];
      for (const score of scores) {
        const result = mapScoreToColor(score);
        expect(result.hex).toMatch(/^#[0-9a-f]{6}$/);
        expect(result.accent_hex).toMatch(/^#[0-9a-f]{6}$/);
      }
    });

    it('clamps score below 0 to calmo', () => {
      const result = mapScoreToColor(-0.5);
      expect(result.label).toBe('calmo');
      expect(result.hsl.h).toBe(160);
    });

    it('clamps score above 1 to critico', () => {
      const result = mapScoreToColor(1.5);
      expect(result.label).toBe('critico');
      expect(result.hsl.h).toBe(0);
    });

    it('transitions through all 5 bands progressively', () => {
      const labels = [0.1, 0.3, 0.5, 0.7, 0.9].map((s) => mapScoreToColor(s).label);
      expect(labels).toEqual(['calmo', 'normale', 'attenzione', 'urgente', 'critico']);
    });

    it('produces decreasing hue as score increases', () => {
      const hues = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0].map((s) => mapScoreToColor(s).hsl.h);
      for (let i = 1; i < hues.length; i++) {
        expect(hues[i]).toBeLessThanOrEqual(hues[i - 1]);
      }
    });
  });

  describe('hslToHex', () => {
    it('converts pure red correctly', () => {
      expect(hslToHex(0, 100, 50)).toBe('#ff0000');
    });

    it('converts pure green correctly', () => {
      expect(hslToHex(120, 100, 50)).toBe('#00ff00');
    });

    it('converts black correctly', () => {
      expect(hslToHex(0, 0, 0)).toBe('#000000');
    });

    it('converts white correctly', () => {
      expect(hslToHex(0, 0, 100)).toBe('#ffffff');
    });
  });
});

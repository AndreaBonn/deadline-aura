const {
  generateWallpaper,
  detectResolution,
  WALLPAPER_PATH,
} = require('../../core/wallpaper-changer');

const SAMPLE_PALETTE = {
  hsl: { h: 160, s: 35, l: 12 },
  hex: '#162d26',
  accent_hex: '#2d6650',
  label: 'calmo',
};

describe('wallpaper-changer', () => {
  describe('detectResolution', () => {
    it('returns a resolution object with width and height', () => {
      const res = detectResolution();
      expect(res).toHaveProperty('width');
      expect(res).toHaveProperty('height');
      expect(typeof res.width).toBe('number');
      expect(typeof res.height).toBe('number');
      expect(res.width).toBeGreaterThan(0);
      expect(res.height).toBeGreaterThan(0);
    });
  });

  describe('generateWallpaper', () => {
    it('returns a canvas of correct dimensions', () => {
      const canvas = generateWallpaper(SAMPLE_PALETTE, { width: 800, height: 600 });
      expect(canvas.width).toBe(800);
      expect(canvas.height).toBe(600);
    });

    it('produces a non-empty PNG buffer', () => {
      const canvas = generateWallpaper(SAMPLE_PALETTE, { width: 100, height: 100 });
      const buffer = canvas.toBuffer('image/png');
      expect(buffer.length).toBeGreaterThan(0);
    });

    it('works with critico palette (h=0)', () => {
      const palette = { hsl: { h: 0, s: 55, l: 7 } };
      const canvas = generateWallpaper(palette, { width: 200, height: 200 });
      expect(canvas.width).toBe(200);
    });

    it('works with large resolution', () => {
      const canvas = generateWallpaper(SAMPLE_PALETTE, { width: 2560, height: 1440 });
      expect(canvas.width).toBe(2560);
      expect(canvas.height).toBe(1440);
    });

    it('creates radial gradient (canvas context test)', () => {
      const canvas = generateWallpaper(SAMPLE_PALETTE, { width: 100, height: 100 });
      const ctx = canvas.getContext('2d');
      const pixel = ctx.getImageData(50, 50, 1, 1).data;
      // Pixel should not be all zeros (transparent)
      const hasColor = pixel[0] + pixel[1] + pixel[2] + pixel[3] > 0;
      expect(hasColor).toBe(true);
    });
  });

  describe('WALLPAPER_PATH', () => {
    it('ends with wallpaper.png', () => {
      expect(WALLPAPER_PATH).toMatch(/wallpaper\.png$/);
    });

    it('is an absolute path', () => {
      expect(WALLPAPER_PATH.startsWith('/')).toBe(true);
    });
  });
});

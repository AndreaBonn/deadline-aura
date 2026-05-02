const { WALLPAPER_PATH } = require('../../core/wallpaper-changer');
const { detectDisplays, computeCanvasGeometry } = require('../../core/display-manager');
const { POSTIT_WIDTH, POSTIT_HEIGHT } = require('../../core/postit-renderer');

describe('wallpaper system', () => {
  describe('WALLPAPER_PATH', () => {
    it('ends with wallpaper.png', () => {
      expect(WALLPAPER_PATH).toMatch(/wallpaper\.png$/);
    });

    it('is an absolute path', () => {
      expect(WALLPAPER_PATH.startsWith('/')).toBe(true);
    });
  });

  describe('display-manager', () => {
    it('detectDisplays returns array with at least one display', () => {
      const displays = detectDisplays();
      expect(Array.isArray(displays)).toBe(true);
      expect(displays.length).toBeGreaterThanOrEqual(1);
      expect(displays[0]).toHaveProperty('width');
      expect(displays[0]).toHaveProperty('height');
      expect(displays[0]).toHaveProperty('id');
    });

    it('computeCanvasGeometry returns correct bounding box for single display', () => {
      const displays = [{ id: '1', width: 1920, height: 1080, x: 0, y: 0 }];
      const geo = computeCanvasGeometry(displays);
      expect(geo.totalWidth).toBe(1920);
      expect(geo.totalHeight).toBe(1080);
      expect(geo.regions).toHaveLength(1);
    });

    it('computeCanvasGeometry handles dual monitor side by side', () => {
      const displays = [
        { id: '1', width: 1920, height: 1080, x: 0, y: 0 },
        { id: '2', width: 2560, height: 1440, x: 1920, y: 0 },
      ];
      const geo = computeCanvasGeometry(displays);
      expect(geo.totalWidth).toBe(1920 + 2560);
      expect(geo.totalHeight).toBe(1440);
      expect(geo.regions).toHaveLength(2);
    });

    it('computeCanvasGeometry returns defaults for empty array', () => {
      const geo = computeCanvasGeometry([]);
      expect(geo.totalWidth).toBe(1920);
      expect(geo.totalHeight).toBe(1080);
    });
  });

  describe('postit-renderer', () => {
    it('exports expected constants', () => {
      expect(POSTIT_WIDTH).toBe(220);
      expect(POSTIT_HEIGHT).toBe(100);
    });
  });
});

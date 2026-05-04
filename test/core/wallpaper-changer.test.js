const { WALLPAPER_PATH, buildPinnedByDisplay } = require('../../core/wallpaper-changer');
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

  describe('buildPinnedByDisplay', () => {
    const dualDisplays = [
      { id: 'eDP-1', width: 1920, height: 1080, x: 0, y: 0, primary: true },
      { id: 'HDMI-1', width: 1920, height: 1080, x: 1920, y: 0, primary: false },
    ];

    it('maps default display_id to primary display on multi-monitor', () => {
      const pinned = [
        { display_id: 'default', task_id: 't1', x_pct: 10, y_pct: 10 },
        { display_id: 'default', task_id: 't2', x_pct: 20, y_pct: 20 },
      ];
      const result = buildPinnedByDisplay(pinned, dualDisplays);
      expect(result['default']).toBeUndefined();
      expect(result['eDP-1']).toHaveLength(2);
      expect(result['eDP-1'].map((p) => p.task_id)).toEqual(['t1', 't2']);
    });

    it('maps orphaned Electron IDs to primary display after reboot', () => {
      const pinned = [
        { display_id: '73400320', task_id: 't1', x_pct: 10, y_pct: 10 },
        { display_id: '73400320', task_id: 't2', x_pct: 20, y_pct: 20 },
      ];
      const result = buildPinnedByDisplay(pinned, dualDisplays);
      expect(result['73400320']).toBeUndefined();
      expect(result['eDP-1']).toHaveLength(2);
    });

    it('preserves tasks already assigned to valid display IDs', () => {
      const pinned = [{ display_id: 'HDMI-1', task_id: 't1', x_pct: 50, y_pct: 50 }];
      const result = buildPinnedByDisplay(pinned, dualDisplays);
      expect(result['HDMI-1']).toHaveLength(1);
      expect(result['eDP-1']).toBeUndefined();
    });

    it('merges default and orphaned into existing primary tasks', () => {
      const pinned = [
        { display_id: 'eDP-1', task_id: 't1', x_pct: 10, y_pct: 10 },
        { display_id: 'default', task_id: 't2', x_pct: 20, y_pct: 20 },
        { display_id: '99999', task_id: 't3', x_pct: 30, y_pct: 30 },
      ];
      const result = buildPinnedByDisplay(pinned, dualDisplays);
      expect(result['eDP-1']).toHaveLength(3);
      expect(result['default']).toBeUndefined();
      expect(result['99999']).toBeUndefined();
    });

    it('returns empty object for empty pinned list', () => {
      const result = buildPinnedByDisplay([], dualDisplays);
      expect(result).toEqual({});
    });
  });
});

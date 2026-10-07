const path = require('path');
const os = require('os');
const childProcess = require('child_process');

// CJS destructures execSync and homedir-derived constants at import time.
// Install boundary spies first; vi.mock does not intercept these require calls.
const homeSpy = vi.spyOn(os, 'homedir').mockReturnValue('/tmp/deadline-aura-test-home');
const execSpy = vi.spyOn(childProcess, 'execSync');
const modulePaths = ['../../core/display-manager', '../../core/wallpaper-changer'];
const previousModules = modulePaths.map((name) => require.cache[require.resolve(name)]);
for (const name of modulePaths) {
  delete require.cache[require.resolve(name)];
}

const { WALLPAPER_PATH, buildPinnedByDisplay } = require('../../core/wallpaper-changer');
const {
  detectDisplays,
  detectDisplaysFromXrandr,
  computeCanvasGeometry,
} = require('../../core/display-manager');
const { POSTIT_WIDTH, POSTIT_HEIGHT } = require('../../core/postit-renderer');

afterAll(() => {
  execSpy.mockRestore();
  homeSpy.mockRestore();
  modulePaths.forEach((name, index) => {
    const key = require.resolve(name);
    if (previousModules[index]) {
      require.cache[key] = previousModules[index];
    } else {
      delete require.cache[key];
    }
  });
});

describe('wallpaper system', () => {
  describe('WALLPAPER_PATH', () => {
    it('stores wallpaper.png in the user data directory', () => {
      expect(WALLPAPER_PATH).toBe(
        path.join(
          '/tmp/deadline-aura-test-home',
          '.local',
          'share',
          'deadlineaura',
          'wallpaper.png',
        ),
      );
    });

    it('resolves the user data directory independently of the working directory', () => {
      expect(path.dirname(WALLPAPER_PATH)).toBe(
        '/tmp/deadline-aura-test-home/.local/share/deadlineaura',
      );
    });
  });

  describe('display-manager', () => {
    it('detectDisplays parses connected xrandr displays with dimensions and offsets', () => {
      execSpy.mockReturnValue(
        [
          'Screen 0: minimum 8 x 8, current 4480 x 1440, maximum 32767 x 32767',
          'eDP-1 connected primary 1920x1080+0+0 (normal left inverted right x axis y axis)',
          'HDMI-1 connected 2560x1440+1920+0 (normal left inverted right x axis y axis)',
          'DP-1 disconnected (normal left inverted right x axis y axis)',
        ].join('\n'),
      );

      const displays = detectDisplays();

      expect(displays).toEqual([
        { id: 'eDP-1', width: 1920, height: 1080, x: 0, y: 0, primary: true },
        { id: 'HDMI-1', width: 2560, height: 1440, x: 1920, y: 0, primary: false },
      ]);
    });

    it('detectDisplaysFromXrandr returns null on command failure and parses a successful command', () => {
      execSpy
        .mockImplementationOnce(() => {
          throw new Error('xrandr unavailable');
        })
        .mockReturnValueOnce('eDP-1 connected primary 1920x1080+0+0');

      const failed = detectDisplaysFromXrandr();
      const succeeded = detectDisplaysFromXrandr();

      expect({ failed, succeeded }).toEqual({
        failed: null,
        succeeded: [{ id: 'eDP-1', width: 1920, height: 1080, x: 0, y: 0, primary: true }],
      });
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

    it('broadcasts all pinned tasks to every display', () => {
      const pinned = [
        { display_id: 'eDP-1', task_id: 't1', x_pct: 10, y_pct: 10 },
        { display_id: 'HDMI-1', task_id: 't2', x_pct: 20, y_pct: 20 },
      ];
      const result = buildPinnedByDisplay(pinned, dualDisplays);
      expect(result['eDP-1']).toHaveLength(2);
      expect(result['HDMI-1']).toHaveLength(2);
      expect(result['eDP-1'].map((p) => p.task_id)).toEqual(['t1', 't2']);
      expect(result['HDMI-1'].map((p) => p.task_id)).toEqual(['t1', 't2']);
    });

    it('broadcasts default display_id tasks to all displays', () => {
      const pinned = [
        { display_id: 'default', task_id: 't1', x_pct: 10, y_pct: 10 },
        { display_id: 'default', task_id: 't2', x_pct: 20, y_pct: 20 },
      ];
      const result = buildPinnedByDisplay(pinned, dualDisplays);
      expect(result['eDP-1']).toHaveLength(2);
      expect(result['HDMI-1']).toHaveLength(2);
    });

    it('broadcasts orphaned Electron IDs to all displays', () => {
      const pinned = [{ display_id: '73400320', task_id: 't1', x_pct: 10, y_pct: 10 }];
      const result = buildPinnedByDisplay(pinned, dualDisplays);
      expect(result['eDP-1']).toHaveLength(1);
      expect(result['HDMI-1']).toHaveLength(1);
    });

    it('works with single display', () => {
      const singleDisplay = [{ id: 'eDP-1', width: 1920, height: 1080, x: 0, y: 0, primary: true }];
      const pinned = [{ display_id: 'eDP-1', task_id: 't1', x_pct: 50, y_pct: 50 }];
      const result = buildPinnedByDisplay(pinned, singleDisplay);
      expect(result['eDP-1']).toHaveLength(1);
    });

    it('returns empty object for empty pinned list', () => {
      const result = buildPinnedByDisplay([], dualDisplays);
      expect(result).toEqual({});
    });
  });
});

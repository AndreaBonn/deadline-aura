'use strict';

const {
  detectDisplaysFromElectron,
  detectDisplays,
  computeCanvasGeometry,
} = require('../../core/display-manager');

function makeElectronDisplay(overrides = {}) {
  return {
    id: 12345,
    scaleFactor: 1,
    size: { width: 1920, height: 1080 },
    bounds: { x: 0, y: 0, width: 1920, height: 1080 },
    ...overrides,
  };
}

describe('display-manager — detectDisplaysFromElectron', () => {
  it('maps Electron display to internal format with string id', () => {
    const mockScreen = {
      getAllDisplays: () => [makeElectronDisplay()],
    };

    const displays = detectDisplaysFromElectron(mockScreen);

    expect(displays).toHaveLength(1);
    expect(displays[0].id).toBe('12345');
    expect(displays[0].width).toBe(1920);
    expect(displays[0].height).toBe(1080);
    expect(displays[0].x).toBe(0);
    expect(displays[0].y).toBe(0);
  });

  it('applies scaleFactor to dimensions and position', () => {
    const mockScreen = {
      getAllDisplays: () => [
        makeElectronDisplay({
          scaleFactor: 2,
          size: { width: 1920, height: 1080 },
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        }),
      ],
    };

    const [display] = detectDisplaysFromElectron(mockScreen);

    expect(display.width).toBe(3840);
    expect(display.height).toBe(2160);
  });

  it('marks display as primary when bounds.x and bounds.y are both 0', () => {
    const mockScreen = {
      getAllDisplays: () => [makeElectronDisplay({ bounds: { x: 0, y: 0, width: 1920, height: 1080 } })],
    };

    const [display] = detectDisplaysFromElectron(mockScreen);

    expect(display.primary).toBe(true);
  });

  it('marks display as non-primary when bounds.x > 0', () => {
    const mockScreen = {
      getAllDisplays: () => [
        makeElectronDisplay({ id: 99, bounds: { x: 1920, y: 0, width: 2560, height: 1440 } }),
      ],
    };

    const [display] = detectDisplaysFromElectron(mockScreen);

    expect(display.primary).toBe(false);
  });

  it('handles multiple displays', () => {
    const mockScreen = {
      getAllDisplays: () => [
        makeElectronDisplay({ id: 1, bounds: { x: 0, y: 0, width: 1920, height: 1080 } }),
        makeElectronDisplay({ id: 2, bounds: { x: 1920, y: 0, width: 2560, height: 1440 } }),
      ],
    };

    const displays = detectDisplaysFromElectron(mockScreen);

    expect(displays).toHaveLength(2);
    expect(displays[0].primary).toBe(true);
    expect(displays[1].primary).toBe(false);
  });

  it('defaults scaleFactor to 1 when missing', () => {
    const mockScreen = {
      getAllDisplays: () => [
        {
          id: 1,
          // no scaleFactor property
          size: { width: 1920, height: 1080 },
          bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        },
      ],
    };

    const [display] = detectDisplaysFromElectron(mockScreen);
    expect(display.width).toBe(1920);
  });
});

describe('display-manager — detectDisplays with Electron screen', () => {
  it('uses Electron screen when provided', () => {
    const mockScreen = {
      getAllDisplays: () => [makeElectronDisplay({ id: 777 })],
    };

    const displays = detectDisplays(mockScreen);

    expect(displays).toHaveLength(1);
    expect(displays[0].id).toBe('777');
  });
});

describe('display-manager — computeCanvasGeometry edge cases', () => {
  it('handles displays with non-zero x offset (side by side)', () => {
    const displays = [
      { id: '1', width: 1920, height: 1080, x: 0, y: 0 },
      { id: '2', width: 2560, height: 1440, x: 1920, y: 0 },
    ];

    const geo = computeCanvasGeometry(displays);

    expect(geo.totalWidth).toBe(1920 + 2560);
    expect(geo.totalHeight).toBe(1440);
    expect(geo.regions[1].x).toBe(1920);
  });

  it('maps displayId from d.id in regions', () => {
    const displays = [{ id: 'eDP-1', width: 1920, height: 1080, x: 0, y: 0 }];

    const geo = computeCanvasGeometry(displays);

    expect(geo.regions[0].displayId).toBe('eDP-1');
  });
});

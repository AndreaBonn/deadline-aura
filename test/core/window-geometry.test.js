'use strict';

const {
  getStripBounds,
  getMeetingDockBounds,
  isRightmost,
  getSidebarBounds,
  getOverlayBounds,
  findDisplayById,
} = require('../../core/window-geometry');

const displays = [
  {
    name: 'primary display with top panel',
    display: {
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 24, width: 1910, height: 1056 },
      workAreaSize: { width: 1910, height: 1056 },
    },
    strip: { x: 1910, y: 24, width: 10, height: 1056 },
    dock: { x: 0, y: 1028, width: 1910, height: 52 },
  },
  {
    name: 'display left of primary with a side panel',
    display: {
      bounds: { x: -2560, y: -200, width: 2560, height: 1440 },
      workArea: { x: -2520, y: -180, width: 2520, height: 1420 },
      workAreaSize: { width: 2520, height: 1420 },
    },
    strip: { x: -10, y: -180, width: 10, height: 1420 },
    dock: { x: -2520, y: 1188, width: 2520, height: 52 },
  },
  {
    name: 'scaled display right of primary',
    display: {
      bounds: { x: 1920, y: 100, width: 1280, height: 720 },
      workArea: { x: 1920, y: 100, width: 1280, height: 680 },
      workAreaSize: { width: 1280, height: 680 },
      scaleFactor: 2,
    },
    strip: { x: 3190, y: 100, width: 10, height: 680 },
    dock: { x: 1920, y: 728, width: 1280, height: 52 },
  },
];

it.each(displays)('places strip at the full display edge: $name', ({ display, strip }) => {
  const original = JSON.parse(JSON.stringify(display));
  expect(getStripBounds(display, 10)).toEqual(strip);
  expect(display).toEqual(original);
});

it.each(displays)('places dock at the work area bottom: $name', ({ display, dock }) => {
  const original = JSON.parse(JSON.stringify(display));
  expect(getMeetingDockBounds(display, 52)).toEqual(dock);
  expect(display).toEqual(original);
});

it('uses the supplied strip width and dock height', () => {
  const display = displays[0].display;
  expect(getStripBounds(display, 6)).toEqual({ x: 1914, y: 24, width: 6, height: 1056 });
  expect(getMeetingDockBounds(display, 40)).toEqual({ x: 0, y: 1040, width: 1910, height: 40 });
});

it('identifies only displays reaching the virtual right edge in a multi-monitor layout', () => {
  expect(displays.map(({ display }) => isRightmost(display, 3200))).toEqual([false, false, true]);
});

it('preserves the inclusive comparison for a display beyond the virtual edge', () => {
  expect(isRightmost(displays[0].display, 1900)).toBe(true);
  expect(isRightmost(displays[1].display, 0)).toBe(true);
});

it.each(displays)('docks the sidebar to the work area right edge: $name', ({ display }) => {
  const original = JSON.parse(JSON.stringify(display));
  const bounds = getSidebarBounds(display, 380);
  expect(bounds).toEqual({
    x: display.workArea.x + display.workAreaSize.width - 380,
    y: display.workArea.y,
    width: 380,
    height: display.workAreaSize.height,
  });
  expect(display).toEqual(original);
});

it('covers the full display with the overlay using bounds origin and size', () => {
  const display = {
    bounds: { x: 1920, y: 100, width: 1280, height: 720 },
    size: { width: 1280, height: 720 },
  };
  expect(getOverlayBounds(display)).toEqual({ x: 1920, y: 100, width: 1280, height: 720 });
});

it('finds a display by its string id and returns undefined when absent', () => {
  const list = [{ id: 7 }, { id: 12 }];
  expect(findDisplayById(list, '12')).toBe(list[1]);
  expect(findDisplayById(list, 'default')).toBeUndefined();
  expect(findDisplayById(list, '1')).toBeUndefined();
});

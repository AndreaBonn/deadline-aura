'use strict';

const { execSync } = require('child_process');

function detectDisplaysFromXrandr() {
  try {
    const output = execSync('xrandr --current 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 3000,
    });

    const displays = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/(\S+)\s+connected\s+(?:primary\s+)?(\d+)x(\d+)\+(\d+)\+(\d+)/);
      if (match) {
        displays.push({
          id: match[1],
          width: parseInt(match[2], 10),
          height: parseInt(match[3], 10),
          x: parseInt(match[4], 10),
          y: parseInt(match[5], 10),
          primary: line.includes('primary'),
        });
      }
    }

    return displays.length > 0 ? displays : null;
  } catch {
    return null;
  }
}

function detectDisplaysFromElectron(screen) {
  return screen.getAllDisplays().map((d) => ({
    id: String(d.id),
    width: d.size.width,
    height: d.size.height,
    x: d.bounds.x,
    y: d.bounds.y,
    primary: d.bounds.x === 0 && d.bounds.y === 0,
  }));
}

function computeCanvasGeometry(displays) {
  if (displays.length === 0) {
    return { totalWidth: 1920, totalHeight: 1080, regions: [] };
  }

  let maxRight = 0;
  let maxBottom = 0;

  const regions = displays.map((d) => {
    const right = d.x + d.width;
    const bottom = d.y + d.height;
    if (right > maxRight) {
      maxRight = right;
    }
    if (bottom > maxBottom) {
      maxBottom = bottom;
    }

    return {
      displayId: d.id,
      x: d.x,
      y: d.y,
      width: d.width,
      height: d.height,
    };
  });

  return {
    totalWidth: maxRight,
    totalHeight: maxBottom,
    regions,
  };
}

function detectDisplays(electronScreen) {
  if (electronScreen) {
    return detectDisplaysFromElectron(electronScreen);
  }
  return detectDisplaysFromXrandr() || [{ id: 'default', width: 1920, height: 1080, x: 0, y: 0, primary: true }];
}

module.exports = {
  detectDisplays,
  detectDisplaysFromXrandr,
  detectDisplaysFromElectron,
  computeCanvasGeometry,
};

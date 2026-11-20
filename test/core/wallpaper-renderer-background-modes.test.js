'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const canvasModule = require('canvas');
const { setLanguage } = require('../../i18n');

const loadImageSpy = vi.spyOn(canvasModule, 'loadImage');
// CommonJS captures loadImage on import, so install the I/O spy before loading it.
const rendererPath = require.resolve('../../core/wallpaper-renderer');
const previousRenderer = require.cache[rendererPath];
delete require.cache[rendererPath];
const { render } = require(rendererPath);

const NOW_MS = new Date('2026-10-07T10:00:00Z').getTime();
const PALETTE = { hsl: { h: 120, s: 30, l: 8 } };
const SINGLE = [{ id: 'eDP-1', width: 800, height: 600, x: 0, y: 0 }];
const DUAL = [
  { id: 'eDP-1', width: 800, height: 600, x: 0, y: 0 },
  { id: 'HDMI-1', width: 800, height: 600, x: 800, y: 0 },
];
// Centre of each region, away from agenda (top-left), band and post-its.
const CENTRE = [400, 300];
const CENTRE_SECOND = [1200, 300];
const WHITE_VEILED = 217; // 255 * (1 - 0.15)

function options(extra = {}) {
  return {
    displays: SINGLE,
    palette: PALETTE,
    score: 0.3,
    pinnedByDisplay: {},
    calendarEvents: [],
    nowMs: NOW_MS,
    ...extra,
  };
}

function pixel(canvas, [x, y]) {
  return Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data);
}

// Buffer.equals is a memcmp; vitest's deep toEqual on PNG buffers takes tens of seconds.
function sameImage(a, b) {
  return a.toBuffer('image/png').equals(b.toBuffer('image/png'));
}

describe('wallpaper-renderer background modes', () => {
  let dir;
  let whitePng;
  let warnSpy;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wallpaper-bg-'));
    whitePng = path.join(dir, 'white.png');
    const white = canvasModule.createCanvas(8, 8);
    const ctx = white.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 8, 8);
    fs.writeFileSync(whitePng, white.toBuffer('image/png'));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    loadImageSpy.mockRestore();
    if (previousRenderer) {
      require.cache[rendererPath] = previousRenderer;
    } else {
      delete require.cache[rendererPath];
    }
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS);
    setLanguage('en');
    loadImageSpy.mockClear();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    vi.useRealTimers();
    setLanguage('it');
  });

  it('custom image gets the same constant 15% veil whatever the score', async () => {
    const background = { mode: 'custom', customPath: whitePng };
    const low = await render(options({ score: 0, background }));
    const high = await render(options({ score: 1, background }));

    for (const canvas of [low, high]) {
      const [r, g, b] = pixel(canvas, CENTRE);
      for (const channel of [r, g, b]) {
        expect(Math.abs(channel - WHITE_VEILED)).toBeLessThanOrEqual(1);
      }
    }
    expect(pixel(low, CENTRE)).toEqual(pixel(high, CENTRE));
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('dynamic mode, by contrast, changes with the score (the neutral veil is not score based)', async () => {
    const low = await render(options({ score: 0.05, background: { mode: 'dynamic' } }));
    const high = await render(options({ score: 0.95, background: { mode: 'dynamic' } }));
    expect(pixel(low, CENTRE)).not.toEqual(pixel(high, CENTRE));
  });

  it('draws the custom image on every region with the same pixel', async () => {
    const canvas = await render(
      options({ displays: DUAL, background: { mode: 'custom', customPath: whitePng } }),
    );
    expect(pixel(canvas, CENTRE_SECOND)).toEqual(pixel(canvas, CENTRE));
    expect(pixel(canvas, CENTRE)[0]).toBeGreaterThan(200);
  });

  it('loads the custom image once for all regions', async () => {
    await render(options({ displays: DUAL, background: { mode: 'custom', customPath: whitePng } }));
    expect(loadImageSpy).toHaveBeenCalledTimes(1);
    expect(loadImageSpy).toHaveBeenCalledWith(whitePng);
  });

  it('gradient mode never loads a background image, dynamic mode does', async () => {
    await render(options({ background: { mode: 'gradient' } }));
    expect(loadImageSpy).not.toHaveBeenCalled();

    await render(options({ background: { mode: 'dynamic' } }));
    expect(loadImageSpy).toHaveBeenCalledTimes(1);
  });

  it('gradient mode paints the palette gradient, not the photo', async () => {
    const gradient = await render(options({ background: { mode: 'gradient' } }));
    const dynamic = await render(options({ background: { mode: 'dynamic' } }));
    expect(sameImage(gradient, dynamic)).toBe(false);
  });

  it.each([
    ['missing', () => path.join(dir, 'absent.png')],
    [
      'corrupt',
      () => {
        const file = path.join(dir, 'corrupt.png');
        fs.writeFileSync(file, 'not an image');
        return file;
      },
    ],
  ])('a %s custom file renders like dynamic and warns once', async (_label, makePath) => {
    const custom = await render(
      options({ background: { mode: 'custom', customPath: makePath() } }),
    );
    const dynamic = await render(options({ background: { mode: 'dynamic' } }));

    expect(sameImage(custom, dynamic)).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toMatch(
      /^\[wallpaper\] custom background unavailable \(.+\), falling back to dynamic$/,
    );
  });

  it('custom mode without a path falls back to dynamic with a warning', async () => {
    const custom = await render(options({ background: { mode: 'custom', customPath: null } }));
    const dynamic = await render(options());
    expect(sameImage(custom, dynamic)).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('omitting background keeps the dynamic behaviour without warnings', async () => {
    await render(options());
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

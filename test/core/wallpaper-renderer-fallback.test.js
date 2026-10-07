'use strict';

const fs = require('fs');
const canvasModule = require('canvas');
const { setLanguage } = require('../../i18n');

const loadImageSpy = vi.spyOn(canvasModule, 'loadImage');
// CommonJS captures loadImage on import, so install the I/O spy before loading it.
const rendererPath = require.resolve('../../core/wallpaper-renderer');
const previousRenderer = require.cache[rendererPath];
delete require.cache[rendererPath];
const { render, BACKGROUNDS_DIR } = require(rendererPath);

const NOW_MS = new Date('2026-10-07T10:00:00Z').getTime();
const OPTIONS = {
  displays: [{ id: 'eDP-1', width: 800, height: 600, x: 0, y: 0 }],
  palette: { hsl: { h: 120, s: 30, l: 8 } },
  score: 0.3,
  pinnedByDisplay: {},
  calendarEvents: [],
  nowMs: NOW_MS,
};

function pixel(canvas, x, y) {
  return Array.from(canvas.getContext('2d').getImageData(x, y, 1, 1).data);
}

describe('wallpaper-renderer render fallback gradient', () => {
  let existsSpy;
  let fillTextSpy;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW_MS);
    setLanguage('en');
    const exists = fs.existsSync.bind(fs);
    existsSpy = vi
      .spyOn(fs, 'existsSync')
      .mockImplementation((file) =>
        String(file).startsWith(BACKGROUNDS_DIR) ? false : exists(file),
      );
    fillTextSpy = vi.spyOn(canvasModule.CanvasRenderingContext2D.prototype, 'fillText');
  });

  afterEach(() => {
    existsSpy.mockRestore();
    fillTextSpy.mockRestore();
    vi.useRealTimers();
    setLanguage('it');
  });

  afterAll(() => {
    loadImageSpy.mockRestore();
    if (previousRenderer) {
      require.cache[rendererPath] = previousRenderer;
    } else {
      delete require.cache[rendererPath];
    }
  });

  it('renders a nonuniform fallback gradient distinct from an available background', async () => {
    const background = canvasModule.createCanvas(20, 20);
    const ctx = background.getContext('2d');
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(0, 0, 20, 20);
    loadImageSpy.mockResolvedValue(background);

    const fallback = await render(OPTIONS);
    existsSpy.mockReturnValue(true);
    const withBackground = await render(OPTIONS);

    expect(pixel(fallback, 280, 270)[1]).toBeGreaterThan(pixel(fallback, 799, 599)[1]);
    expect(fallback.toBuffer('image/png')).not.toEqual(withBackground.toBuffer('image/png'));
  });

  it('renders a red high-score gradient instead of the green low-score palette', async () => {
    const low = await render(OPTIONS);
    const high = await render({
      ...OPTIONS,
      score: 0.95,
      palette: { hsl: { h: 0, s: 80, l: 15 } },
    });

    const [red, green] = pixel(high, 280, 270);
    expect(red).toBeGreaterThan(green);
    expect(pixel(high, 280, 270)).not.toEqual(pixel(low, 280, 270));
  });

  it('paints the fallback gradient separately in every display region', async () => {
    const displays = [...OPTIONS.displays, { id: 'HDMI-1', width: 800, height: 600, x: 800, y: 0 }];

    const canvas = await render({ ...OPTIONS, displays });

    expect(pixel(canvas, 1080, 270)).toEqual(pixel(canvas, 280, 270));
    expect(pixel(canvas, 1080, 270)[1]).toBeGreaterThan(pixel(canvas, 1599, 599)[1]);
  });

  it('draws the agenda over the fallback gradient', async () => {
    const calendarEvents = [{ title: 'Meeting', start_at: NOW_MS + 3600000, source: 'gcal' }];

    const canvas = await render({ ...OPTIONS, calendarEvents });

    expect(fillTextSpy.mock.calls.map(([text]) => text)).toEqual(
      expect.arrayContaining(['NEXT 24H', 'Meeting']),
    );
    expect(pixel(canvas, 280, 400)[1]).toBeGreaterThan(pixel(canvas, 799, 599)[1]);
  });
});

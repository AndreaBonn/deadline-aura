'use strict';

const { renderPostit, renderPostits } = require('../../core/postit-renderer');
const { setLanguage } = require('../../i18n');

const NOW_MS = new Date('2026-10-07T10:00:00Z').getTime();
const MS_PER_HOUR = 3600000;
const GLYPH_WIDTH = 8;

function makeCtx() {
  const calls = [];
  return {
    _calls: calls,
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    fill: vi.fn(function () {
      calls.push({ op: 'fill', color: this.fillStyle });
    }),
    stroke: vi.fn(function () {
      calls.push({ op: 'stroke', color: this.strokeStyle, width: this.lineWidth });
    }),
    fillRect: vi.fn(),
    measureText: (text) => ({ width: text.length * GLYPH_WIDTH }),
    fillText: vi.fn(function (text, x, y) {
      calls.push({ op: 'fillText', text, x, y, baseline: this.textBaseline });
    }),
  };
}

function makeTask(overrides = {}) {
  return {
    task_id: 'gcal_test',
    title: 'Test Event',
    priority: 3,
    due_at: NOW_MS + 3 * MS_PER_HOUR,
    ...overrides,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW_MS);
  setLanguage('it');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('postit-renderer renderPostit', () => {
  it('draws the future task countdown in the header', () => {
    const ctx = makeCtx();

    renderPostit(ctx, { task: makeTask(), x: 100, y: 100, scale: 1 });

    expect(ctx.fillText).toHaveBeenCalledWith('3h', 306, 114);
  });

  it('draws the expired label for an overdue task', () => {
    const ctx = makeCtx();

    renderPostit(ctx, { task: makeTask({ due_at: NOW_MS - MS_PER_HOUR }), x: 0, y: 0, scale: 1 });

    expect(ctx.fillText).toHaveBeenCalledWith('scaduto', 206, 14);
  });

  it('draws the code and title without a countdown when due_at is null', () => {
    const ctx = makeCtx();

    renderPostit(ctx, { task: makeTask({ due_at: null }), x: 0, y: 0, scale: 1 });

    expect(ctx.fillText.mock.calls).toEqual([
      ['Test Event', 14, 14],
      ['Test Event', 14, 36.4],
    ]);
  });

  it('uses the unscaled card dimensions when scale is omitted', () => {
    const ctx = makeCtx();

    renderPostit(ctx, { task: makeTask(), x: 10, y: 20 });

    expect(ctx.roundRect.mock.calls).toEqual([
      [10, 20, 220, 100, 6],
      [10, 20, 220, 28, [6, 6, 0, 0]],
    ]);
  });

  it('draws the supplied title in the header and body', () => {
    const ctx = makeCtx();

    renderPostit(ctx, { task: makeTask({ title: 'My Event' }), x: 0, y: 0, scale: 1 });

    expect(ctx.fillText.mock.calls).toEqual([
      ['My Event', 14, 14],
      ['3h', 206, 14],
      ['My Event', 14, 36.4],
    ]);
  });

  it.each([
    [1, '#ef4444'],
    [2, '#f97316'],
    [99, '#3b82f6'],
  ])('paints priority %s with accent %s', (priority, color) => {
    const ctx = makeCtx();

    renderPostit(ctx, { task: makeTask({ priority }), x: 0, y: 0, scale: 1 });

    expect(ctx._calls.filter(({ op }) => op === 'fill')).toEqual([
      { op: 'fill', color: 'rgba(18, 20, 30, 0.92)' },
      { op: 'fill', color },
    ]);
    expect(ctx.fillStyle).toBe(color);
  });

  it.each([
    [0.5, '30m'],
    [5, '5h'],
    [72, '3g'],
    [-1, 'scaduto'],
  ])('draws the countdown for %s hours as %s', (hours, label) => {
    const ctx = makeCtx();

    renderPostit(ctx, {
      task: makeTask({ due_at: NOW_MS + hours * MS_PER_HOUR }),
      x: 0,
      y: 0,
      scale: 1,
    });

    expect(ctx.fillText).toHaveBeenCalledWith(label, 206, 14);
  });

  it('wraps a long title into two body lines and omits further lines', () => {
    const ctx = makeCtx();
    const title = 'First section fits well second section fits too third section omitted';

    renderPostit(ctx, { task: makeTask({ title }), x: 0, y: 0, scale: 1 });

    expect(
      ctx._calls.filter(({ op, baseline }) => op === 'fillText' && baseline === 'top'),
    ).toEqual([
      { op: 'fillText', text: 'First section fits well', x: 14, y: 36.4, baseline: 'top' },
      { op: 'fillText', text: 'second section fits too', x: 14, y: 52.4, baseline: 'top' },
    ]);
  });

  it('keeps a short title on one body line without an empty second line', () => {
    const ctx = makeCtx();

    renderPostit(ctx, { task: makeTask({ title: 'Short title' }), x: 0, y: 0, scale: 1 });

    expect(
      ctx._calls.filter(({ op, baseline }) => op === 'fillText' && baseline === 'top'),
    ).toEqual([{ op: 'fillText', text: 'Short title', x: 14, y: 36.4, baseline: 'top' }]);
  });

  it('draws a red border for a stale task', () => {
    const ctx = makeCtx();

    renderPostit(ctx, { task: makeTask({ is_stale: true }), x: 0, y: 0, scale: 1 });

    expect(ctx._calls.filter(({ op }) => op === 'stroke')).toEqual([
      { op: 'stroke', color: '#ef4444', width: 2 },
    ]);
    expect(ctx.save).toHaveBeenCalledTimes(2);
  });

  it('draws a fresh task card without a stale border', () => {
    const ctx = makeCtx();

    renderPostit(ctx, { task: makeTask({ is_stale: false }), x: 0, y: 0, scale: 1 });

    expect(ctx.fill).toHaveBeenCalledTimes(2);
    expect(ctx.stroke).not.toHaveBeenCalled();
    expect(ctx.save).toHaveBeenCalledTimes(1);
  });
});

describe('postit-renderer renderPostits', () => {
  const region = { x: 0, y: 0, width: 1920, height: 1080 };

  it('draws nothing for an empty pinned list and draws a supplied task', () => {
    const empty = makeCtx();
    const populated = makeCtx();

    renderPostits(empty, [], region);
    renderPostits(populated, [makeTask({ x_pct: 0, y_pct: 0 })], region);

    expect(empty.fillText.mock.calls).toEqual([]);
    expect(populated.fillText).toHaveBeenCalledWith('Test Event', 14, 36.4);
  });

  it('draws each pinned task at its percentage position within the display', () => {
    const ctx = makeCtx();
    const pinned = [
      makeTask({ title: 'Event A', x_pct: 10, y_pct: 20 }),
      makeTask({ task_id: 'jira_2', title: 'PROJ-1 Task B', x_pct: 50, y_pct: 50 }),
    ];

    renderPostits(ctx, pinned, { ...region, x: 800, y: 100 });

    expect(ctx.fillText).toHaveBeenCalledWith('Event A', 1006, 352.4);
    expect(ctx.fillText).toHaveBeenCalledWith('PROJ-1 Task B', 1774, 676.4);
  });

  it('clamps the card scale to 0.8 on a display half as wide as 1920', () => {
    const ctx = makeCtx();
    const narrowRegion = { x: 0, y: 0, width: 960, height: 540 };

    renderPostits(ctx, [makeTask({ x_pct: 10, y_pct: 10 })], narrowRegion);

    expect(ctx.roundRect.mock.calls[0]).toEqual([96, 54, 176, 80, expect.closeTo(4.8)]);
  });
});

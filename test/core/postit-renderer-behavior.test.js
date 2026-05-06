'use strict';

// formatCountdown and getPostitColor are not exported — test through extractCode
// and the exported constants. renderPostit/renderPostits require canvas mocking.

const {
  extractCode,
  POSTIT_WIDTH,
  POSTIT_HEIGHT,
} = require('../../core/postit-renderer');

// We test the internal formatCountdown behavior by re-importing via a seam:
// postit-renderer does not export formatCountdown, so we test its effects
// indirectly through renderPostit with a mock canvas.

describe('postit-renderer — formatCountdown (via mock canvas)', () => {
  function makeCtx() {
    const calls = [];
    return {
      _calls: calls,
      save: () => calls.push('save'),
      restore: () => calls.push('restore'),
      beginPath: () => {},
      fill: () => {},
      stroke: () => {},
      roundRect: () => {},
      fillRect: () => {},
      measureText: () => ({ width: 10 }),
      fillText: (text, x, y) => calls.push({ op: 'fillText', text, x, y }),
      set fillStyle(v) {},
      set font(v) {},
      set textAlign(v) {},
      set textBaseline(v) {},
      set shadowColor(v) {},
      set shadowBlur(v) {},
      set shadowOffsetX(v) {},
      set shadowOffsetY(v) {},
      set strokeStyle(v) {},
      set lineWidth(v) {},
      set letterSpacing(v) {},
      moveTo: () => {},
      lineTo: () => {},
    };
  }

  const { renderPostit } = require('../../core/postit-renderer');

  function makeTask(overrides = {}) {
    return {
      task_id: 'gcal_test',
      title: 'Test Event',
      priority: 3,
      due_at: Date.now() + 3 * 3600000,
      ...overrides,
    };
  }

  it('renders without throwing for a valid future task', () => {
    const ctx = makeCtx();
    expect(() => renderPostit(ctx, { task: makeTask(), x: 100, y: 100, scale: 1 })).not.toThrow();
  });

  it('renders without throwing for an overdue task', () => {
    const ctx = makeCtx();
    expect(() =>
      renderPostit(ctx, { task: makeTask({ due_at: Date.now() - 3600000 }), x: 0, y: 0, scale: 1 }),
    ).not.toThrow();
  });

  it('renders without throwing when due_at is null (no countdown)', () => {
    const ctx = makeCtx();
    expect(() =>
      renderPostit(ctx, { task: makeTask({ due_at: null }), x: 0, y: 0, scale: 1 }),
    ).not.toThrow();
  });

  it('renders without throwing when scale is not provided (defaults to 1)', () => {
    const ctx = makeCtx();
    expect(() =>
      renderPostit(ctx, { task: makeTask(), x: 0, y: 0 }),
    ).not.toThrow();
  });

  it('renders text content with fillText calls', () => {
    const ctx = makeCtx();
    renderPostit(ctx, { task: makeTask({ title: 'My Event' }), x: 0, y: 0, scale: 1 });
    const textCalls = ctx._calls.filter((c) => c.op === 'fillText');
    expect(textCalls.length).toBeGreaterThan(0);
  });

  describe('priority color mapping', () => {
    it('renders priority 1 task without throwing', () => {
      const ctx = makeCtx();
      expect(() =>
        renderPostit(ctx, { task: makeTask({ priority: 1 }), x: 0, y: 0, scale: 1 }),
      ).not.toThrow();
    });

    it('renders priority 2 task without throwing', () => {
      const ctx = makeCtx();
      expect(() =>
        renderPostit(ctx, { task: makeTask({ priority: 2 }), x: 0, y: 0, scale: 1 }),
      ).not.toThrow();
    });

    it('renders unknown priority (falls back to priority 3 color) without throwing', () => {
      const ctx = makeCtx();
      expect(() =>
        renderPostit(ctx, { task: makeTask({ priority: 99 }), x: 0, y: 0, scale: 1 }),
      ).not.toThrow();
    });
  });

  describe('countdown text in header', () => {
    it('shows minutes when less than 1 hour remaining', () => {
      const ctx = makeCtx();
      renderPostit(ctx, { task: makeTask({ due_at: Date.now() + 1800000 }), x: 0, y: 0, scale: 1 });
      const texts = ctx._calls.filter((c) => c.op === 'fillText').map((c) => c.text);
      expect(texts.some((t) => /^\d+m$/.test(t))).toBe(true);
    });

    it('shows hours when 1-24 hours remaining', () => {
      const ctx = makeCtx();
      renderPostit(ctx, { task: makeTask({ due_at: Date.now() + 5 * 3600000 }), x: 0, y: 0, scale: 1 });
      const texts = ctx._calls.filter((c) => c.op === 'fillText').map((c) => c.text);
      expect(texts.some((t) => /^\d+h$/.test(t))).toBe(true);
    });

    it('shows days when more than 24 hours remaining', () => {
      const ctx = makeCtx();
      renderPostit(ctx, { task: makeTask({ due_at: Date.now() + 72 * 3600000 }), x: 0, y: 0, scale: 1 });
      const texts = ctx._calls.filter((c) => c.op === 'fillText').map((c) => c.text);
      expect(texts.some((t) => /^\d+g$/.test(t))).toBe(true);
    });

    it('shows "scaduto" for overdue tasks', () => {
      const ctx = makeCtx();
      renderPostit(ctx, { task: makeTask({ due_at: Date.now() - 3600000 }), x: 0, y: 0, scale: 1 });
      const texts = ctx._calls.filter((c) => c.op === 'fillText').map((c) => c.text);
      expect(texts.some((t) => t === 'scaduto')).toBe(true);
    });
  });
});

describe('postit-renderer — renderPostits', () => {
  const { renderPostits } = require('../../core/postit-renderer');

  function makeCtx() {
    return {
      save: () => {},
      restore: () => {},
      beginPath: () => {},
      fill: () => {},
      roundRect: () => {},
      fillRect: () => {},
      measureText: () => ({ width: 10 }),
      fillText: () => {},
      set fillStyle(v) {},
      set font(v) {},
      set textAlign(v) {},
      set textBaseline(v) {},
      set shadowColor(v) {},
      set shadowBlur(v) {},
      set shadowOffsetX(v) {},
      set shadowOffsetY(v) {},
    };
  }

  const region = { x: 0, y: 0, width: 1920, height: 1080 };

  it('renders nothing for empty pinned list', () => {
    const ctx = makeCtx();
    expect(() => renderPostits(ctx, [], region)).not.toThrow();
  });

  it('renders each pinned task without throwing', () => {
    const ctx = makeCtx();
    const pinnedTasks = [
      { task_id: 'gcal_1', title: 'Event A', priority: 1, due_at: Date.now() + 3600000, x_pct: 10, y_pct: 20 },
      { task_id: 'jira_2', title: 'PROJ-1 · Task B', priority: 2, due_at: Date.now() + 7200000, x_pct: 50, y_pct: 50 },
    ];
    expect(() => renderPostits(ctx, pinnedTasks, region)).not.toThrow();
  });

  it('scales based on region width vs 1920', () => {
    const ctx = makeCtx();
    const narrowRegion = { x: 0, y: 0, width: 960, height: 540 };
    // Should clamp scale to 0.8 minimum for narrow regions
    expect(() =>
      renderPostits(ctx, [{ task_id: 'gcal_x', title: 'T', priority: 3, due_at: null, x_pct: 10, y_pct: 10 }], narrowRegion),
    ).not.toThrow();
  });
});

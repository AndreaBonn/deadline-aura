const { createFirstRunHint } = require('../../core/first-run-hint');

function setup({ firstRun = true, markDone = vi.fn() } = {}) {
  const log = { warn: vi.fn() };
  const hint = createFirstRunHint({
    markerPath: '/marker',
    isFirstRun: (path) => (path === '/marker' ? firstRun : false),
    markDone,
    log,
  });
  return { hint, log, markDone };
}

describe('createFirstRunHint', () => {
  it('is not pending until init() has checked the marker', () => {
    const { hint } = setup({ firstRun: true });
    expect(hint.isPending()).toBe(false);
  });

  it('init() makes the hint pending on the very first run', () => {
    const { hint } = setup({ firstRun: true });
    hint.init();
    expect(hint.isPending()).toBe(true);
  });

  it('init() leaves the hint off when the marker already exists', () => {
    const { hint } = setup({ firstRun: false });
    hint.init();
    expect(hint.isPending()).toBe(false);
  });

  it('dismiss() clears a pending hint', () => {
    const { hint } = setup();
    hint.init();
    hint.dismiss();
    expect(hint.isPending()).toBe(false);
  });

  it('markShown() writes the marker without clearing the pending hint', () => {
    const { hint, markDone } = setup();
    hint.init();
    hint.markShown();
    expect(markDone).toHaveBeenCalledWith('/marker');
    expect(hint.isPending()).toBe(true);
  });

  it('markShown() swallows a write failure and warns, so a crash never blocks the app', () => {
    const { hint, log } = setup({
      markDone: () => {
        throw new Error('read-only fs');
      },
    });
    expect(() => hint.markShown()).not.toThrow();
    expect(log.warn).toHaveBeenCalledWith('onboarding: could not write marker:', 'read-only fs');
  });
});

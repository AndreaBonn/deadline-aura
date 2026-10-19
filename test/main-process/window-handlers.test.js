const { createWindowHandlers } = require('../../main-process/window-handlers');

describe('window handlers', () => {
  it('map the three window channels to the sidebar and settings windows', () => {
    const sidebar = { toggle: vi.fn() };
    const settings = { open: vi.fn(), close: vi.fn() };
    const groups = createWindowHandlers({ sidebar, settings });
    expect(groups.handle).toBeUndefined();
    expect(Object.keys(groups.on).sort()).toEqual([
      'settings:close',
      'settings:open',
      'sidebar:toggle',
    ]);
    groups.on['sidebar:toggle']();
    expect(sidebar.toggle).toHaveBeenCalledTimes(1);
    groups.on['settings:open']();
    expect(settings.open).toHaveBeenCalledTimes(1);
    expect(settings.close).not.toHaveBeenCalled();
    groups.on['settings:close']();
    expect(settings.close).toHaveBeenCalledTimes(1);
  });
});

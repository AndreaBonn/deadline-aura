const { createAiUsageHandlers } = require('../../../core/ipc/ai-usage-handlers');

function setup() {
  const calls = [];
  const deps = {
    runCaptureCommand: vi.fn((command, options) => {
      calls.push(['run', command]);
      return { command, home: options.home };
    }),
    syncCaptureBin: () => calls.push(['sync']),
    homedir: () => '/home/u',
  };
  return { calls, deps, handlers: createAiUsageHandlers(deps) };
}

describe('ai-usage capture handlers', () => {
  it('registers exactly the three capture channels', () => {
    expect(Object.keys(setup().handlers).sort()).toEqual([
      'ai-usage:capture-install',
      'ai-usage:capture-status',
      'ai-usage:capture-uninstall',
    ]);
  });

  it('status runs the command for the user home without refreshing the scripts', () => {
    const { handlers, calls } = setup();
    expect(handlers['ai-usage:capture-status']()).toEqual({ command: 'status', home: '/home/u' });
    expect(calls).toEqual([['run', 'status']]);
  });

  it.each([['install'], ['uninstall']])(
    '%s refreshes the capture scripts first, then runs the command',
    (command) => {
      const { handlers, calls } = setup();
      expect(handlers[`ai-usage:capture-${command}`]()).toEqual({ command, home: '/home/u' });
      expect(calls).toEqual([['sync'], ['run', command]]);
    },
  );

  it('propagates a throwing command (the renderer sees a rejected invoke)', () => {
    const { handlers, deps } = setup();
    deps.runCaptureCommand.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => handlers['ai-usage:capture-status']()).toThrow('boom');
  });
});

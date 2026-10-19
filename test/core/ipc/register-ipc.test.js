const { registerIpc } = require('../../../core/ipc/register-ipc');

function createFakeIpcMain() {
  const registered = { handle: new Map(), on: new Map() };
  return {
    registered,
    handle: (channel, listener) => registered.handle.set(channel, listener),
    on: (channel, listener) => registered.on.set(channel, listener),
  };
}

describe('registerIpc', () => {
  it('registers handle channels with ipcMain.handle and on channels with ipcMain.on', () => {
    const ipcMain = createFakeIpcMain();
    registerIpc(ipcMain, {
      handle: { 'a:one': () => 1, 'a:two': () => 2 },
      on: { 'b:fire': () => {} },
    });
    expect([...ipcMain.registered.handle.keys()]).toEqual(['a:one', 'a:two']);
    expect([...ipcMain.registered.on.keys()]).toEqual(['b:fire']);
  });

  it('passes only the payload to the handler, dropping the IPC event', async () => {
    const ipcMain = createFakeIpcMain();
    const seen = [];
    registerIpc(ipcMain, {
      handle: {
        'a:echo': (...args) => {
          seen.push(args);
          return 'result';
        },
      },
    });
    const listener = ipcMain.registered.handle.get('a:echo');
    const result = await listener({ sender: 'event-object' }, { x: 1 });
    expect(result).toBe('result');
    expect(seen).toEqual([[{ x: 1 }]]);
  });

  it('passes only the payload to on handlers', () => {
    const ipcMain = createFakeIpcMain();
    const seen = [];
    registerIpc(ipcMain, { on: { 'b:fire': (...args) => seen.push(args) } });
    ipcMain.registered.on.get('b:fire')({ sender: 'event-object' }, 'payload');
    expect(seen).toEqual([['payload']]);
  });

  it('accepts a call with no groups and registers nothing', () => {
    const ipcMain = createFakeIpcMain();
    registerIpc(ipcMain, {});
    expect(ipcMain.registered.handle.size).toBe(0);
    expect(ipcMain.registered.on.size).toBe(0);
  });

  it('propagates a handler error to the caller', () => {
    const ipcMain = createFakeIpcMain();
    registerIpc(ipcMain, {
      handle: {
        'a:boom': () => {
          throw new Error('boom');
        },
      },
    });
    expect(() => ipcMain.registered.handle.get('a:boom')({}, undefined)).toThrow('boom');
  });

  it('reads config through getConfig at call time, so a reassigned config is seen', () => {
    const ipcMain = createFakeIpcMain();
    let config = { v: 1 };
    const deps = { getConfig: () => config, applyConfig: (next) => (config = next) };
    registerIpc(ipcMain, { handle: { 'cfg:get': () => deps.getConfig().v } });
    const listener = ipcMain.registered.handle.get('cfg:get');
    expect(listener({}, undefined)).toBe(1);
    deps.applyConfig({ v: 2 });
    expect(listener({}, undefined)).toBe(2);
  });
});

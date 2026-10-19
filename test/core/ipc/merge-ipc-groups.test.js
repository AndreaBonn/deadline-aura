const { mergeIpcGroups, registerIpc } = require('../../../core/ipc/register-ipc');

describe('mergeIpcGroups', () => {
  it('merges handle and on maps across groups, tolerating missing sides', () => {
    const a = () => 1;
    const b = () => 2;
    const c = () => 3;
    expect(mergeIpcGroups({ handle: { x: a } }, { on: { y: b } }, { handle: { z: c } })).toEqual({
      handle: { x: a, z: c },
      on: { y: b },
    });
  });

  it('keeps registration order of groups', () => {
    const merged = mergeIpcGroups({ on: { first: () => {} } }, { on: { second: () => {} } });
    expect(Object.keys(merged.on)).toEqual(['first', 'second']);
  });

  it.each(['handle', 'on'])(
    'throws on a duplicate %s channel instead of silently overriding',
    (side) => {
      expect(() =>
        mergeIpcGroups({ [side]: { dup: () => {} } }, { [side]: { dup: () => {} } }),
      ).toThrow('Duplicate IPC channel: dup');
    },
  );

  it('feeds registerIpc: handle maps to ipcMain.handle, on maps to ipcMain.on', () => {
    const registered = [];
    registerIpc(
      {
        handle: (channel) => registered.push(['handle', channel]),
        on: (channel) => registered.push(['on', channel]),
      },
      mergeIpcGroups({ handle: { a: () => {} } }, { on: { b: () => {} } }),
    );
    expect(registered).toEqual([
      ['handle', 'a'],
      ['on', 'b'],
    ]);
  });
});

const { createTaskFavoriteHandlers } = require('../../../core/ipc/task-favorite-handlers');

function setup() {
  const calls = [];
  const deps = {
    favoriteQueries: {
      favoriteTask: (id) => calls.push(['favorite', id]),
      unfavoriteTask: (id) => calls.push(['unfavorite', id]),
    },
    refresh: (options) => calls.push(['refresh', options]),
  };
  return { calls, deps, groups: createTaskFavoriteHandlers(deps) };
}

describe('task favorite handlers', () => {
  it('are fire-and-forget channels only', () => {
    const { groups } = setup();
    expect(groups.handle).toBeUndefined();
    expect(Object.keys(groups.on).sort()).toEqual(['task:favorite', 'task:unfavorite']);
  });

  it('favorite stores the task, then forces a refresh', () => {
    const { groups, calls } = setup();
    groups.on['task:favorite']('t-1');
    expect(calls).toEqual([
      ['favorite', 't-1'],
      ['refresh', { force: true }],
    ]);
  });

  it('unfavorite removes the task, then forces a refresh', () => {
    const { groups, calls } = setup();
    groups.on['task:unfavorite']('t-1');
    expect(calls).toEqual([
      ['unfavorite', 't-1'],
      ['refresh', { force: true }],
    ]);
  });

  it('does not refresh when the store throws', () => {
    const { groups, deps, calls } = setup();
    deps.favoriteQueries.favoriteTask = () => {
      throw new Error('db');
    };
    expect(() => groups.on['task:favorite']('t-1')).toThrow('db');
    expect(calls).toEqual([]);
  });
});

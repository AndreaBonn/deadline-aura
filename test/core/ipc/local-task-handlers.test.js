const { createLocalTaskHandlers } = require('../../../core/ipc/local-task-handlers');

function createFakeLocalQueries() {
  const calls = [];
  const tasks = new Map();
  return {
    calls,
    tasks,
    createLocalTask: vi.fn(({ title, dueAt, priority }) => {
      calls.push('create');
      const id = `local_${tasks.size + 1}`;
      tasks.set(id, { id, title, dueAt, priority });
      return id;
    }),
    updateLocalTask: vi.fn(({ id, ...fields }) => {
      calls.push('update');
      tasks.set(id, { ...tasks.get(id), ...fields });
    }),
    deleteLocalTask: vi.fn((id) => {
      calls.push('delete');
      tasks.delete(id);
    }),
    completeLocalTask: vi.fn((id) => {
      calls.push('complete');
      tasks.set(id, { ...tasks.get(id), done: true });
    }),
  };
}

function setup() {
  const localQueries = createFakeLocalQueries();
  const refresh = vi.fn(() => localQueries.calls.push('refresh'));
  const handlers = createLocalTaskHandlers({ localQueries, refresh });
  return { localQueries, refresh, handlers };
}

describe('createLocalTaskHandlers', () => {
  it('exposes exactly the four local-task channels', () => {
    const { handlers } = setup();
    expect(Object.keys(handlers).sort()).toEqual([
      'local-task:complete',
      'local-task:create',
      'local-task:delete',
      'local-task:update',
    ]);
  });

  describe('local-task:create', () => {
    it('trims the title, defaults priority to 3, writes then refreshes with force', () => {
      const { handlers, localQueries, refresh } = setup();
      const result = handlers['local-task:create']({ title: '  Buy milk  ', dueAt: 123 });
      expect(result).toEqual({ ok: true, id: 'local_1' });
      expect(localQueries.createLocalTask).toHaveBeenCalledWith({
        title: 'Buy milk',
        dueAt: 123,
        priority: 3,
      });
      expect(refresh).toHaveBeenCalledWith({ force: true });
      expect(localQueries.calls).toEqual(['create', 'refresh']);
    });

    it('converts a provided priority to a number', () => {
      const { handlers, localQueries } = setup();
      handlers['local-task:create']({ title: 'x', priority: '2' });
      expect(localQueries.createLocalTask).toHaveBeenCalledWith({
        title: 'x',
        dueAt: undefined,
        priority: 2,
      });
    });

    it('rejects an empty title without writing or refreshing', () => {
      const { handlers, localQueries, refresh } = setup();
      expect(handlers['local-task:create']({ title: '   ' })).toEqual({
        ok: false,
        error: 'INVALID_TITLE',
      });
      expect(localQueries.createLocalTask).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('rejects an out-of-range priority without writing', () => {
      const { handlers, localQueries, refresh } = setup();
      expect(handlers['local-task:create']({ title: 'x', priority: 9 })).toEqual({
        ok: false,
        error: 'INVALID_PRIORITY',
      });
      expect(localQueries.createLocalTask).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('propagates a store error and does not refresh', () => {
      const { handlers, localQueries, refresh } = setup();
      localQueries.createLocalTask.mockImplementation(() => {
        throw new Error('db down');
      });
      expect(() => handlers['local-task:create']({ title: 'x' })).toThrow('db down');
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe('local-task:update', () => {
    it('trims the title, passes other fields through unchanged, then refreshes', () => {
      const { handlers, localQueries, refresh } = setup();
      const result = handlers['local-task:update']({
        id: 'local_1',
        title: ' New ',
        dueAt: 55,
        priority: 2,
      });
      expect(result).toEqual({ ok: true });
      expect(localQueries.updateLocalTask).toHaveBeenCalledWith({
        id: 'local_1',
        title: 'New',
        dueAt: 55,
        priority: 2,
      });
      expect(localQueries.calls).toEqual(['update', 'refresh']);
      expect(refresh).toHaveBeenCalledWith({ force: true });
    });

    it('leaves an omitted title undefined', () => {
      const { handlers, localQueries } = setup();
      handlers['local-task:update']({ id: 'local_1', priority: 1 });
      expect(localQueries.updateLocalTask).toHaveBeenCalledWith({
        id: 'local_1',
        title: undefined,
        dueAt: undefined,
        priority: 1,
      });
    });

    it.each([
      [{ title: 'x' }, 'INVALID_ID'],
      [{ id: 5, title: 'x' }, 'INVALID_ID'],
      [{ id: 'a', title: '  ' }, 'INVALID_TITLE'],
      [{ id: 'a', priority: 0 }, 'INVALID_PRIORITY'],
    ])('rejects %j with %s without writing', (payload, error) => {
      const { handlers, localQueries, refresh } = setup();
      expect(handlers['local-task:update'](payload)).toEqual({ ok: false, error });
      expect(localQueries.updateLocalTask).not.toHaveBeenCalled();
      expect(refresh).not.toHaveBeenCalled();
    });

    it('propagates a store error and does not refresh', () => {
      const { handlers, localQueries, refresh } = setup();
      localQueries.updateLocalTask.mockImplementation(() => {
        throw new Error('db down');
      });
      expect(() => handlers['local-task:update']({ id: 'a' })).toThrow('db down');
      expect(refresh).not.toHaveBeenCalled();
    });
  });

  describe.each([
    ['local-task:delete', 'deleteLocalTask'],
    ['local-task:complete', 'completeLocalTask'],
  ])('%s', (channel, method) => {
    it('calls the store with the id, then refreshes with force', () => {
      const { handlers, localQueries, refresh } = setup();
      expect(handlers[channel]('local_9')).toEqual({ ok: true });
      expect(localQueries[method]).toHaveBeenCalledWith('local_9');
      expect(refresh).toHaveBeenCalledWith({ force: true });
      expect(localQueries.calls.at(-1)).toBe('refresh');
    });

    it.each([[undefined], [''], [42], [{ id: 'a' }]])(
      'rejects invalid id %j with INVALID_ID',
      (taskId) => {
        const { handlers, localQueries, refresh } = setup();
        expect(handlers[channel](taskId)).toEqual({ ok: false, error: 'INVALID_ID' });
        expect(localQueries[method]).not.toHaveBeenCalled();
        expect(refresh).not.toHaveBeenCalled();
      },
    );

    it('propagates a store error and does not refresh', () => {
      const { handlers, localQueries, refresh } = setup();
      localQueries[method].mockImplementation(() => {
        throw new Error('db down');
      });
      expect(() => handlers[channel]('a')).toThrow('db down');
      expect(refresh).not.toHaveBeenCalled();
    });
  });
});

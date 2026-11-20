'use strict';

const { google } = require('googleapis');
const googleAuth = require('../../integrations/google-auth');
const { MAX_PAGES } = require('../../integrations/google-tasks');
const tasksModulePath = require.resolve('../../integrations/google-tasks');

function makeConfig(overrides = {}) {
  return {
    sources: {
      google_calendar: {
        enabled: true,
        oauth: { client_id: 'id', client_secret: 'secret' },
        ...overrides,
      },
    },
  };
}

describe('google-tasks fetchTasks', () => {
  let fetchTasks;
  let previousModule;
  let authSpy;
  let errorSpy;
  let service;

  beforeEach(() => {
    previousModule = require.cache[tasksModulePath];
    delete require.cache[tasksModulePath];
    authSpy = vi.spyOn(googleAuth, 'getAuthenticatedClient').mockResolvedValue({});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    service = {
      tasklists: { list: vi.fn().mockResolvedValue({ data: { items: [] } }) },
      tasks: { list: vi.fn() },
    };
    vi.spyOn(google, 'tasks').mockReturnValue(service);
    ({ fetchTasks } = require('../../integrations/google-tasks'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    delete require.cache[tasksModulePath];
    if (previousModule) {
      require.cache[tasksModulePath] = previousModule;
    }
  });

  it('aggregates normalized tasks from multiple task lists', async () => {
    service.tasklists.list.mockResolvedValue({
      data: { items: [{ id: 'work' }, { id: 'home' }] },
    });
    service.tasks.list.mockImplementation(async ({ tasklist }) => ({
      data: { items: [{ id: tasklist, title: `${tasklist} task`, status: 'needsAction' }] },
    }));

    const result = await fetchTasks(makeConfig());

    expect(result).toEqual([
      expect.objectContaining({ id: 'gtasks_work', title: 'work task', source: 'gtasks' }),
      expect.objectContaining({ id: 'gtasks_home', title: 'home task', source: 'gtasks' }),
    ]);
  });

  it('follows nextPageToken and returns the tasks of every page of a list', async () => {
    service.tasklists.list.mockResolvedValue({ data: { items: [{ id: 'work', title: 'Work' }] } });
    service.tasks.list.mockImplementation(async ({ pageToken }) =>
      pageToken === 'page-2'
        ? { data: { items: [{ id: 't2', title: 'Second', status: 'needsAction' }] } }
        : {
            data: {
              items: [{ id: 't1', title: 'First', status: 'needsAction' }],
              nextPageToken: 'page-2',
            },
          },
    );

    const result = await fetchTasks(makeConfig());

    expect(result.map((t) => t.id)).toEqual(['gtasks_t1', 'gtasks_t2']);
    expect(service.tasks.list).toHaveBeenCalledTimes(2);
    expect(service.tasks.list.mock.calls[0][0].pageToken).toBeUndefined();
    expect(service.tasks.list.mock.calls[1][0]).toMatchObject({
      tasklist: 'work',
      pageToken: 'page-2',
    });
  });

  it('follows nextPageToken over the task lists themselves', async () => {
    service.tasklists.list.mockImplementation(async ({ pageToken }) =>
      pageToken === 'lists-2'
        ? { data: { items: [{ id: 'home', title: 'Home' }] } }
        : { data: { items: [{ id: 'work', title: 'Work' }], nextPageToken: 'lists-2' } },
    );
    service.tasks.list.mockImplementation(async ({ tasklist }) => ({
      data: { items: [{ id: `${tasklist}-1`, title: tasklist, status: 'needsAction' }] },
    }));

    const result = await fetchTasks(makeConfig());

    expect(result.map((t) => t.id)).toEqual(['gtasks_work-1', 'gtasks_home-1']);
    expect(service.tasklists.list.mock.calls[1][0]).toMatchObject({ pageToken: 'lists-2' });
  });

  it('makes a single call for a list without nextPageToken', async () => {
    service.tasklists.list.mockResolvedValue({ data: { items: [{ id: 'work', title: 'Work' }] } });
    service.tasks.list.mockResolvedValue({
      data: { items: [{ id: 't1', title: 'Only', status: 'needsAction' }] },
    });

    const result = await fetchTasks(makeConfig());

    expect(result.map((t) => t.id)).toEqual(['gtasks_t1']);
    expect(service.tasks.list).toHaveBeenCalledTimes(1);
  });

  it('stops at the page cap, warns and keeps the tasks read when nextPageToken never ends', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    service.tasklists.list.mockResolvedValue({ data: { items: [{ id: 'work', title: 'Work' }] } });
    service.tasks.list.mockImplementation(async () => ({
      data: {
        items: [{ id: 'same', title: 'Loop', status: 'needsAction' }],
        nextPageToken: 'again',
      },
    }));

    const result = await fetchTasks(makeConfig());

    expect(service.tasks.list).toHaveBeenCalledTimes(MAX_PAGES);
    expect(result).toHaveLength(MAX_PAGES);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Work'));
  });

  it('fails the whole fetch when a later page of a list cannot be read', async () => {
    service.tasklists.list.mockResolvedValue({ data: { items: [{ id: 'work', title: 'Work' }] } });
    service.tasks.list.mockImplementation(async ({ pageToken }) => {
      if (pageToken) {
        throw new Error('page 2 unavailable');
      }
      return {
        data: {
          items: [{ id: 't1', title: 'First', status: 'needsAction' }],
          nextPageToken: 'page-2',
        },
      };
    });

    await expect(fetchTasks(makeConfig())).rejects.toThrow(/"Work"/);
  });

  it('fails the whole fetch, naming the list, when one task list cannot be read', async () => {
    service.tasklists.list.mockResolvedValue({
      data: {
        items: [
          { id: 'work', title: 'Work' },
          { id: 'home', title: 'Home' },
        ],
      },
    });
    service.tasks.list.mockImplementation(async ({ tasklist }) => {
      if (tasklist === 'work') {
        throw new Error('list unavailable');
      }
      return { data: { items: [{ id: 'home-task', title: 'Home task', status: 'needsAction' }] } };
    });

    await expect(fetchTasks(makeConfig())).rejects.toThrow(/"Work"/);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Work'), 'list unavailable');
  });

  it('does not put the list contents or the upstream message in the thrown error', async () => {
    service.tasklists.list.mockResolvedValue({ data: { items: [{ id: 'work', title: 'Work' }] } });
    service.tasks.list.mockRejectedValue(new Error('token ya29.SECRET rejected'));

    const failure = await fetchTasks(makeConfig()).catch((err) => err);

    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).not.toContain('ya29.SECRET');
  });

  it('logs and rethrows a failure to fetch task lists', async () => {
    const error = new Error('task lists unavailable');
    service.tasklists.list.mockRejectedValue(error);

    const promise = fetchTasks(makeConfig());

    await expect(promise).rejects.toThrow(error);
    expect(errorSpy).toHaveBeenCalledWith(
      'Google Tasks: error fetching task lists:',
      error.message,
    );
  });

  it('returns no tasks without authenticating when the source is disabled', async () => {
    const config = makeConfig({ enabled: false });

    const result = await fetchTasks(config);

    expect(result).toEqual([]);
    expect(authSpy).not.toHaveBeenCalled();
  });

  it('returns no tasks without authenticating when OAuth credentials are missing', async () => {
    vi.stubEnv('GOOGLE_CLIENT_ID', undefined);
    vi.stubEnv('GOOGLE_CLIENT_SECRET', undefined);
    const config = makeConfig({ oauth: undefined });

    const result = await fetchTasks(config);

    expect(result).toEqual([]);
    expect(authSpy).not.toHaveBeenCalled();
  });
});

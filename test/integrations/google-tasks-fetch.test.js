'use strict';

const { google } = require('googleapis');
const gcal = require('../../integrations/google-calendar');
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
    authSpy = vi.spyOn(gcal, 'getAuthenticatedClient').mockResolvedValue({});
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

  it('logs a failed task list and continues fetching the remaining lists', async () => {
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

    const result = await fetchTasks(makeConfig());

    expect(result).toEqual([
      expect.objectContaining({ id: 'gtasks_home-task', title: 'Home task' }),
    ]);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Work'), 'list unavailable');
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

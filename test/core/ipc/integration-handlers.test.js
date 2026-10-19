const { createIntegrationHandlers } = require('../../../core/ipc/integration-handlers');

function setup(authResult = { ok: true }) {
  const config = { id: 'live-config' };
  const deps = {
    gcal: { authorizeGoogle: vi.fn(async () => authResult) },
    getConfig: () => config,
    runManualSync: vi.fn(),
    openLink: vi.fn(),
  };
  return { deps, config, groups: createIntegrationHandlers(deps) };
}

describe('integration handlers: registration shape', () => {
  it('authorize is request/response, sync and open-link are fire-and-forget', () => {
    const { groups } = setup();
    expect(Object.keys(groups.handle)).toEqual(['google:authorize']);
    expect(Object.keys(groups.on).sort()).toEqual(['shell:open-link', 'sync:run']);
  });
});

describe('google:authorize', () => {
  it('authorizes with the live config, returns the result and syncs right away', async () => {
    const { groups, deps, config } = setup({ ok: true });
    await expect(groups.handle['google:authorize']()).resolves.toEqual({ ok: true });
    expect(deps.gcal.authorizeGoogle).toHaveBeenCalledWith(config);
    expect(deps.runManualSync).toHaveBeenCalledTimes(1);
  });

  it('does not sync when the account was already authorized', async () => {
    const { groups, deps } = setup({ ok: true, alreadyAuthorized: true });
    await expect(groups.handle['google:authorize']()).resolves.toEqual({
      ok: true,
      alreadyAuthorized: true,
    });
    expect(deps.runManualSync).not.toHaveBeenCalled();
  });

  it('does not sync when authorization failed, and passes the failure through', async () => {
    const { groups, deps } = setup({ ok: false, error: 'DENIED' });
    await expect(groups.handle['google:authorize']()).resolves.toEqual({
      ok: false,
      error: 'DENIED',
    });
    expect(deps.runManualSync).not.toHaveBeenCalled();
  });

  it('rejects when the authorization call throws, without syncing', async () => {
    const { groups, deps } = setup();
    deps.gcal.authorizeGoogle.mockRejectedValue(new Error('network'));
    await expect(groups.handle['google:authorize']()).rejects.toThrow('network');
    expect(deps.runManualSync).not.toHaveBeenCalled();
  });
});

describe('sync:run and shell:open-link', () => {
  it('sync:run starts a manual sync', () => {
    const { groups, deps } = setup();
    groups.on['sync:run']();
    expect(deps.runManualSync).toHaveBeenCalledTimes(1);
  });

  it('shell:open-link forwards the url to the safe opener', () => {
    const { groups, deps } = setup();
    groups.on['shell:open-link']('https://example.com');
    expect(deps.openLink).toHaveBeenCalledWith('https://example.com');
  });
});

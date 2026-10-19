const { createSettingsHandlers, toSaveIssues } = require('../../../core/ipc/settings-handlers');
const { DEFAULTS } = require('../../../config/defaults');
const { configSchema } = require('../../../config/schema');
const masking = require('../../../config/secret-masking');
const { pickVerifyToken } = require('../../../integrations/jira');

function setup() {
  let config = globalThis.structuredClone(DEFAULTS);
  const calls = [];
  const deps = {
    getConfig: vi.fn(() => config),
    defaults: DEFAULTS,
    maskConfigForRenderer: masking.maskConfigForRenderer,
    restoreTokens: vi.fn((next, current) => {
      calls.push('restoreTokens');
      masking.restoreTokens(next, current);
    }),
    configSchema: {
      safeParse: vi.fn((next) => {
        calls.push('safeParse');
        return configSchema.safeParse(next);
      }),
    },
    applyConfig: vi.fn((next) => {
      calls.push('applyConfig');
      config = next;
    }),
    gcal: {},
    jira: { pickVerifyToken, verifyJiraInstance: vi.fn(async () => ({ ok: true })) },
    getLastSyncStatus: vi.fn(() => null),
    collectSourceFacts: vi.fn(() => ['facts']),
    describeSourceStatus: vi.fn(() => ['status']),
  };
  return {
    deps,
    calls,
    handlers: createSettingsHandlers(deps),
    replaceConfig: (next) => (config = next),
  };
}

describe('settings reads', () => {
  it('masks secrets and reads reassigned config on every call', () => {
    const { handlers, replaceConfig } = setup();
    expect(handlers['settings:get-config']()).toEqual(DEFAULTS);
    const next = globalThis.structuredClone(DEFAULTS);
    next.ai.api_keys = { groq: 'secret' };
    replaceConfig(next);
    expect(handlers['settings:get-config']().ai.api_keys.groq).toBe(masking.TOKEN_MASK);
    expect(next.ai.api_keys.groq).toBe('secret');
  });

  it('returns defaults even when an irrelevant payload is supplied', () => {
    expect(setup().handlers['settings:get-defaults']('ignored')).toBe(DEFAULTS);
  });

  it.each(['settings:get-config', 'settings:source-status'])(
    '%s propagates a config read failure',
    (channel) => {
      const { handlers, deps } = setup();
      deps.getConfig.mockImplementation(() => {
        throw new Error('read');
      });
      expect(() => handlers[channel]()).toThrow('read');
    },
  );

  it('reports no sync timestamp and then the reassigned status and config', () => {
    const { handlers, deps, replaceConfig } = setup();
    expect(handlers['settings:source-status']()).toEqual({ at: null, sources: ['status'] });
    const config = globalThis.structuredClone(DEFAULTS);
    replaceConfig(config);
    const lastSyncStatus = { at: 123 };
    deps.getLastSyncStatus.mockReturnValue(lastSyncStatus);
    expect(handlers['settings:source-status']('ignored')).toEqual({ at: 123, sources: ['status'] });
    expect(deps.collectSourceFacts).toHaveBeenLastCalledWith(config, {
      gcal: deps.gcal,
      jira: deps.jira,
      lastSyncStatus,
    });
    expect(deps.describeSourceStatus).toHaveBeenCalledWith(['facts']);
  });
});

describe('settings:save-config', () => {
  it('restores real tokens before parsing, then applies the parsed config', () => {
    const { handlers, deps, calls, replaceConfig } = setup();
    const config = globalThis.structuredClone(DEFAULTS);
    config.ai.api_keys = { groq: 'secret' };
    replaceConfig(config);
    expect(handlers['settings:save-config'](masking.maskConfigForRenderer(config))).toEqual({
      ok: true,
    });
    expect(calls).toEqual(['restoreTokens', 'safeParse', 'applyConfig']);
    expect(deps.applyConfig.mock.calls[0][0].ai.api_keys.groq).toBe('secret');
  });

  it('returns field errors and dotted issue paths without applying invalid config', () => {
    const { handlers, deps, calls } = setup();
    const next = globalThis.structuredClone(DEFAULTS);
    next.sources.jira.instances = [{ domain: 42, email: '', api_token: '' }];
    const result = handlers['settings:save-config'](next);
    expect(result.ok).toBe(false);
    expect(result.errors.sources).toHaveLength(1);
    expect(result.issues).toEqual([
      {
        path: 'sources.jira.instances.0.domain',
        code: 'invalid_type',
        minimum: undefined,
        maximum: undefined,
        message: 'Expected string, received number',
      },
    ]);
    expect(calls).toEqual(['restoreTokens', 'safeParse']);
    expect(deps.applyConfig).not.toHaveBeenCalled();
  });

  it.each(['restoreTokens', 'applyConfig'])(
    'propagates %s failures instead of returning a failure object',
    (dependency) => {
      const { handlers, deps } = setup();
      deps[dependency].mockImplementation(() => {
        throw new Error('disk');
      });
      expect(() => handlers['settings:save-config'](globalThis.structuredClone(DEFAULTS))).toThrow(
        'disk',
      );
    },
  );

  it('propagates schema failures', () => {
    const { handlers, deps } = setup();
    deps.configSchema.safeParse.mockImplementation(() => {
      throw new Error('schema');
    });
    expect(() => handlers['settings:save-config'](globalThis.structuredClone(DEFAULTS))).toThrow(
      'schema',
    );
  });

  it('maps bounds and root paths without mutating issues', () => {
    const issues = [{ path: [], code: 'too_small', minimum: 1, maximum: 9, message: 'bounds' }];
    expect(toSaveIssues(issues)).toEqual([{ ...issues[0], path: '' }]);
    expect(issues[0].path).toEqual([]);
    expect(toSaveIssues([])).toEqual([]);
  });
});

describe('jira:verify', () => {
  it('matches saved credentials by domain and email, not domain alone', async () => {
    const { handlers, deps, replaceConfig } = setup();
    const config = globalThis.structuredClone(DEFAULTS);
    config.sources.jira.instances = [
      { domain: 'site', email: 'other-account', api_token: 'wrong' },
      { domain: 'site', email: 'account', api_token: 'secret' },
    ];
    replaceConfig(config);
    const instance = { domain: 'site', email: 'account', api_token: masking.TOKEN_MASK };
    expect(await handlers['jira:verify']({ index: 0, instance })).toEqual({ ok: true });
    expect(deps.jira.verifyJiraInstance).toHaveBeenCalledWith({
      domain: 'site',
      email: 'account',
      apiToken: 'secret',
      jql: config.sources.jira.jql,
    });
  });

  it.each(['', 'saved', 'custom'])('uses the appropriate JQL for %j', async (jql) => {
    const { handlers, deps, replaceConfig } = setup();
    const config = globalThis.structuredClone(DEFAULTS);
    config.sources.jira.jql = jql === 'saved' ? 'saved' : '';
    delete config.sources.jira.instances;
    replaceConfig(config);
    const instance = {
      domain: 'new',
      email: 'user',
      api_token: 'new-token',
      jql: jql === 'custom' ? jql : '',
    };
    expect(await handlers['jira:verify']({ instance })).toEqual({ ok: true });
    expect(deps.jira.verifyJiraInstance.mock.calls[0][0].jql).toBe(
      jql || DEFAULTS.sources.jira.jql,
    );
  });

  it('returns MISSING_FIELDS when no usable token is available', () => {
    const { handlers, deps } = setup();
    expect(
      handlers['jira:verify']({ instance: { domain: 'new', email: 'user', api_token: '' } }),
    ).toEqual({ ok: false, error: 'MISSING_FIELDS' });
    expect(deps.jira.verifyJiraInstance).not.toHaveBeenCalled();
  });

  it('rejects when the Jira dependency rejects', async () => {
    const { handlers, deps } = setup();
    deps.jira.verifyJiraInstance.mockRejectedValue(new Error('network'));
    await expect(handlers['jira:verify']({ instance: { api_token: 'token' } })).rejects.toThrow(
      'network',
    );
  });
});

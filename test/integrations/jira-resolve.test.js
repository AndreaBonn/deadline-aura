'use strict';

const { fetchIssues } = require('../../integrations/jira');

describe('jira — resolveInstances env fallback', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('resolves instances from JIRA_DOMAINS env var when no instances in config', async () => {
    process.env.JIRA_DOMAINS = 'company.atlassian.net';
    process.env.JIRA_EMAIL = 'dev@company.com';
    process.env.JIRA_API_TOKEN = 'tok123';

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ issues: [], isLast: true }),
    });

    const config = {
      sources: {
        jira: {
          enabled: true,
          instances: [],
          jql: 'assignee = currentUser()',
        },
      },
    };
    const result = await fetchIssues(config);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain('company.atlassian.net');
    expect(result).toEqual([]);
  });

  it('resolves from JIRA_DOMAIN (singular) env var', async () => {
    delete process.env.JIRA_DOMAINS;
    process.env.JIRA_DOMAIN = 'single.atlassian.net';
    process.env.JIRA_EMAIL = 'user@co.com';
    process.env.JIRA_API_TOKEN = 'secret';

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ issues: [], isLast: true }),
    });

    const config = {
      sources: { jira: { enabled: true, instances: [], jql: 'status != Done' } },
    };
    await fetchIssues(config);

    expect(global.fetch.mock.calls[0][0]).toContain('single.atlassian.net');
  });

  it('returns empty when env vars are missing', async () => {
    delete process.env.JIRA_DOMAINS;
    delete process.env.JIRA_DOMAIN;
    delete process.env.JIRA_EMAIL;
    delete process.env.JIRA_API_TOKEN;

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const config = {
      sources: { jira: { enabled: true, instances: [], jql: 'anything' } },
    };
    const result = await fetchIssues(config);

    expect(result).toEqual([]);
    consoleSpy.mockRestore();
  });

  it('handles multiple JIRA_DOMAINS comma-separated', async () => {
    process.env.JIRA_DOMAINS = 'a.atlassian.net,b.atlassian.net';
    process.env.JIRA_EMAIL = 'user@co.com';
    process.env.JIRA_API_TOKEN = 'tok';

    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ issues: [], isLast: true }),
    });

    const config = {
      sources: { jira: { enabled: true, instances: [], jql: 'any' } },
    };
    await fetchIssues(config);

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

describe('jira — fetchFromInstance error handling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('captures fetch error and returns empty after retries', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network error'));

    const config = {
      sources: {
        jira: {
          enabled: true,
          instances: [
            { domain: 'bad.atlassian.net', email: 'u@c.com', apiToken: 't', jql: 'x' },
          ],
          jql: 'default',
        },
      },
    };

    const promise = fetchIssues(config);
    // Advance past all retry delays (2s + 4s + 8s)
    await vi.advanceTimersByTimeAsync(15000);
    const result = await promise;

    expect(result).toEqual([]);
    consoleSpy.mockRestore();
  });
});

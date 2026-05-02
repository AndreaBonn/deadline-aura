const { fetchIssues } = require('../../integrations/jira');

function makeConfig(overrides = {}) {
  const { enabled = true, instances, ...rest } = overrides;
  return {
    sources: {
      jira: {
        enabled,
        jql: 'assignee = currentUser()',
        instances: instances || [
          {
            domain: 'test.atlassian.net',
            email: 'user@test.com',
            api_token: 'test-token',
            ...rest,
          },
        ],
      },
    },
  };
}

function mockJiraResponse(issues, total) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      total: total !== undefined ? total : issues.length,
      issues,
    }),
  };
}

describe('jira fetchIssues', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty array when jira is disabled', async () => {
    const config = makeConfig({ enabled: false });
    const result = await fetchIssues(config);
    expect(result).toEqual([]);
  });

  it('returns empty array when no instances configured', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const config = makeConfig({ instances: [] });
    const result = await fetchIssues(config);
    expect(result).toEqual([]);
    consoleSpy.mockRestore();
  });

  it('fetches and normalizes issues', async () => {
    const issues = [
      {
        id: '10001',
        key: 'PROJ-1',
        fields: {
          summary: 'Fix bug',
          priority: { name: 'High' },
          duedate: '2026-06-01',
          status: { name: 'In Progress' },
        },
      },
    ];

    vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockJiraResponse(issues));

    const config = makeConfig();
    const result = await fetchIssues(config);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('jira_10001');
    expect(result[0].title).toContain('PROJ-1');
    expect(result[0].priority).toBe(2);
  });

  it('handles pagination (multiple pages)', async () => {
    const page1Issues = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      key: `P-${i}`,
      fields: { summary: `Issue ${i}`, priority: { name: 'Medium' }, duedate: null },
    }));
    const page2Issues = [
      {
        id: '100',
        key: 'P-100',
        fields: { summary: 'Last issue', priority: { name: 'Low' }, duedate: null },
      },
    ];

    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(mockJiraResponse(page1Issues, 51))
      .mockResolvedValueOnce(mockJiraResponse(page2Issues, 51));

    const config = makeConfig();
    const result = await fetchIssues(config);

    expect(result).toHaveLength(51);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('sends correct Authorization header', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockJiraResponse([]));

    const config = makeConfig();
    await fetchIssues(config);

    const fetchCall = global.fetch.mock.calls[0];
    const authHeader = fetchCall[1].headers.Authorization;
    const decoded = Buffer.from(authHeader.replace('Basic ', ''), 'base64').toString();
    expect(decoded).toBe('user@test.com:test-token');
  });

  it('constructs correct JQL query URL', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockJiraResponse([]));

    const config = makeConfig();
    config.sources.jira.jql = 'project = TEST';
    await fetchIssues(config);

    const url = global.fetch.mock.calls[0][0];
    expect(url).toContain('test.atlassian.net');
    expect(url).toContain('jql=project');
  });
});

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

function mockJiraResponse(issues, { isLast = true, nextPageToken = null } = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      issues,
      isLast,
      nextPageToken,
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
      .mockResolvedValueOnce(mockJiraResponse(page1Issues, { isLast: false, nextPageToken: 'abc' }))
      .mockResolvedValueOnce(mockJiraResponse(page2Issues));

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

describe('jira fetchIssues HTTP retries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('retries a 429 response and returns the issues from the successful response', async () => {
    const issue = { id: 'retry', key: 'PROJ-2', fields: { summary: 'Retry issue' } };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ status: 429, ok: false })
      .mockResolvedValueOnce(mockJiraResponse([issue]));

    const promise = fetchIssues(makeConfig());
    await vi.advanceTimersByTimeAsync(2000);
    const result = await promise;

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      expect.objectContaining({ id: 'jira_retry', title: 'PROJ-2 · Retry issue' }),
    ]);
  });

  it('rejects after three persistent 429 responses when the only instance is rate limited', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ status: 429, ok: false });

    const promise = fetchIssues(makeConfig());
    const outcome = expect(promise).rejects.toThrow(
      'test.atlassian.net: Jira API 429: rate limited',
    );
    await vi.advanceTimersByTimeAsync(2000 + 4000 + 8000);

    // A rejection lets the sync keep the existing Jira tasks instead of marking them stale.
    await outcome;
  });

  it('stops after three attempts when every response is a 429', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ status: 429, ok: false });

    const promise = fetchIssues(makeConfig()).catch(() => {});
    await vi.advanceTimersByTimeAsync(2000 + 4000 + 8000);
    await promise;

    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('logs the domain and HTTP 500 status and rejects when the only instance fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });

    const promise = fetchIssues(makeConfig());
    const outcome = expect(promise).rejects.toThrow('Jira API 500: Internal Server Error');
    await vi.advanceTimersByTimeAsync(2000 + 4000);
    await outcome;

    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(errorSpy).toHaveBeenCalledWith(
      'Jira [test.atlassian.net]: fetch error:',
      'Jira API 500: Internal Server Error',
    );
  });

  it('rejects with the healthy instance issues attached when another instance fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const issue = { id: 'ok1', key: 'OK-1', fields: { summary: 'Healthy' } };
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) =>
      String(url).includes('down.atlassian.net')
        ? { ok: false, status: 503, statusText: 'Service Unavailable' }
        : mockJiraResponse([issue]),
    );
    const config = makeConfig({
      instances: [
        { domain: 'up.atlassian.net', email: 'u@x.io', api_token: 't' },
        { domain: 'down.atlassian.net', email: 'u@x.io', api_token: 't' },
      ],
    });

    const promise = fetchIssues(config);
    const settled = promise.then(
      () => null,
      (err) => err,
    );
    await vi.advanceTimersByTimeAsync(2000 + 4000);
    const err = await settled;

    // The sync must not treat a partial answer as complete: it would mark the failed
    // site's issues as stale. The healthy issues travel with the error instead.
    expect(err.message).toContain('down.atlassian.net');
    expect(err.partialIssues).toEqual([expect.objectContaining({ id: 'jira_ok1' })]);
  });
});

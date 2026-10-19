'use strict';

const { verifyJiraInstance } = require('../../integrations/jira');

const INSTANCE = {
  domain: 'acme.atlassian.net',
  email: 'me@acme.io',
  apiToken: 'token',
  jql: 'assignee = currentUser()',
};

function respond(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: async () => body,
  };
}

describe('jira verifyJiraInstance', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports how many issues the filter returns', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      respond(200, { issues: [{}, {}, {}], isLast: true }),
    );

    await expect(verifyJiraInstance(INSTANCE)).resolves.toEqual({
      ok: true,
      count: 3,
      more: false,
    });
  });

  it('flags that more issues exist beyond the first page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(200, { issues: [{}], isLast: false }));

    await expect(verifyJiraInstance(INSTANCE)).resolves.toMatchObject({ ok: true, more: true });
  });

  it('sends one authenticated request with the instance filter', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(200, { issues: [] }));

    await verifyJiraInstance(INSTANCE);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toContain('https://acme.atlassian.net/rest/api/3/search/jql?');
    expect(new URL(url).searchParams.get('jql')).toBe('assignee = currentUser()');
    expect(options.headers.Authorization).toMatch(/^Basic /);
  });

  it.each([
    [401, 'AUTH_FAILED'],
    [403, 'AUTH_FAILED'],
    [404, 'NOT_FOUND'],
    [400, 'INVALID_JQL'],
    [500, 'HTTP_500'],
  ])('maps HTTP %s to %s', async (status, error) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(respond(status));

    await expect(verifyJiraInstance(INSTANCE)).resolves.toEqual({ ok: false, error });
  });

  it('reports an unreachable site when the request itself fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    await expect(verifyJiraInstance(INSTANCE)).resolves.toEqual({
      ok: false,
      error: 'UNREACHABLE',
    });
  });

  it('refuses incomplete fields without calling the network', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(verifyJiraInstance({ ...INSTANCE, apiToken: '' })).resolves.toEqual({
      ok: false,
      error: 'MISSING_FIELDS',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('refuses a domain that is not a plain host name', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(
      verifyJiraInstance({ ...INSTANCE, domain: 'acme.atlassian.net/evil?x=' }),
    ).resolves.toEqual({ ok: false, error: 'INVALID_DOMAIN' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('jira verifyJiraInstance — internal hosts', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    '169.254.169.254',
    '10.0.0.5',
    '127.1',
    '0x7f.1',
    'jira.local',
    'box.internal',
    'app.localhost',
  ])('refuses %s without calling the network', async (domain) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(verifyJiraInstance({ ...INSTANCE, domain })).resolves.toEqual({
      ok: false,
      error: 'INVALID_DOMAIN',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('jira pickVerifyToken', () => {
  const { pickVerifyToken } = require('../../integrations/jira');
  const saved = { domain: 'acme.atlassian.net', email: 'me@acme.io', api_token: 'real-token' };
  const MASK = '••••••••';

  it('uses the token the user just typed', () => {
    expect(pickVerifyToken({ ...saved, api_token: 'typed' }, saved, MASK)).toBe('typed');
  });

  it('uses the saved token when the masked one comes back for the same site and email', () => {
    expect(pickVerifyToken({ ...saved, api_token: MASK }, saved, MASK)).toBe('real-token');
  });

  it('never sends the saved token to a different site', () => {
    expect(
      pickVerifyToken({ ...saved, domain: 'attacker.example.com', api_token: MASK }, saved, MASK),
    ).toBeNull();
  });

  it('never sends the saved token for a different account', () => {
    expect(
      pickVerifyToken({ ...saved, email: 'other@acme.io', api_token: MASK }, saved, MASK),
    ).toBeNull();
  });

  it('passes a typed token through for a new instance without a saved one', () => {
    expect(pickVerifyToken({ ...saved, api_token: 'typed' }, undefined, undefined)).toBe('typed');
  });
});

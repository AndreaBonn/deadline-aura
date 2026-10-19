'use strict';

const net = require('net');

const PRIORITY_MAP = {
  highest: 1,
  blocker: 1,
  high: 2,
  medium: 3,
  low: 4,
  lowest: 4,
};

const MAX_RESULTS_PER_PAGE = 50;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000];

function mapJiraPriority(priorityName) {
  if (!priorityName) {
    return 3;
  }
  return PRIORITY_MAP[priorityName.toLowerCase()] || 3;
}

function buildAuthHeader(email, apiToken) {
  const encoded = Buffer.from(`${email}:${apiToken}`).toString('base64');
  return `Basic ${encoded}`;
}

async function fetchWithRetry(url, options) {
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.status === 429) {
        // Without an Error here a persistent 429 ends the loop throwing null.
        lastError = new Error('Jira API 429: rate limited');
        const delay = RETRY_DELAYS[attempt] || 8000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      if (!response.ok) {
        throw new Error(`Jira API ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES - 1) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt]));
      }
    }
  }

  throw lastError;
}

function normalizeIssue(issue, domain) {
  const dueDate = issue.fields?.duedate;
  const dueAt = dueDate ? new Date(dueDate + 'T23:59:59').getTime() : null;
  const webUrl = domain && issue.key ? `https://${domain}/browse/${issue.key}` : null;

  return {
    id: `jira_${issue.id}`,
    source: 'jira',
    title: `${issue.key} · ${issue.fields?.summary || '(no title)'}`,
    due_at: dueAt,
    priority: mapJiraPriority(issue.fields?.priority?.name),
    is_done: 0,
    web_url: webUrl,
    raw_json: JSON.stringify(issue),
    synced_at: Date.now(),
  };
}

async function fetchFromInstance({ domain, email, apiToken, jql }) {
  const authHeader = buildAuthHeader(email, apiToken);
  const baseUrl = `https://${domain}/rest/api/3/search/jql`;
  const fields = 'summary,priority,duedate,status,assignee';

  const issues = [];
  let nextPageToken = null;

  do {
    const params = new URLSearchParams({
      jql,
      fields,
      maxResults: String(MAX_RESULTS_PER_PAGE),
    });
    if (nextPageToken) {
      params.set('nextPageToken', nextPageToken);
    }

    try {
      const data = await fetchWithRetry(`${baseUrl}?${params}`, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
      });

      const pageIssues = data.issues || [];
      issues.push(...pageIssues.map((issue) => normalizeIssue(issue, domain)));
      nextPageToken = data.isLast === false ? data.nextPageToken : null;
    } catch (err) {
      // A half-read instance is a failed instance: returning its first pages would let the
      // sync mark the issues of the missing pages as stale.
      console.error(`Jira [${domain}]: fetch error:`, err.message);
      throw new Error(`${domain}: ${err.message}`);
    }
  } while (nextPageToken);

  return issues;
}

function resolveInstances(config) {
  const { jira: jiraConfig } = config.sources;

  if (jiraConfig.instances && jiraConfig.instances.length > 0) {
    return jiraConfig.instances;
  }

  // Fallback: env vars JIRA_DOMAINS=domain1,domain2
  const domains = (process.env.JIRA_DOMAINS || process.env.JIRA_DOMAIN || '')
    .split(',')
    .filter(Boolean);
  const email = process.env.JIRA_EMAIL || '';
  const apiToken = process.env.JIRA_API_TOKEN || '';

  if (domains.length === 0 || !email || !apiToken) {
    return [];
  }

  return domains.map((domain) => ({
    domain: domain.trim(),
    email,
    apiToken,
    jql: jiraConfig.jql,
  }));
}

async function fetchIssues(config) {
  const { jira: jiraConfig } = config.sources;

  if (!jiraConfig.enabled) {
    return [];
  }

  const instances = resolveInstances(config);

  if (instances.length === 0) {
    console.error('Jira: no instances configured (set JIRA_DOMAINS, JIRA_EMAIL, JIRA_API_TOKEN)');
    return [];
  }

  const results = await Promise.allSettled(
    instances.map((inst) =>
      fetchFromInstance({
        domain: inst.domain,
        email: inst.email,
        apiToken: inst.apiToken || inst.api_token,
        jql: inst.jql || jiraConfig.jql,
      }),
    ),
  );

  // Any failed site makes the source fail, so the sync does not mark that site's issues
  // as stale. The issues of the healthy sites travel with the error: the sync stores them
  // without touching the rest.
  const failed = results.filter((r) => r.status === 'rejected');
  const issues = results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
  if (failed.length > 0) {
    const error = new Error(failed.map((r) => r.reason.message).join('; '));
    error.partialIssues = issues;
    throw error;
  }
  return issues;
}

const VERIFY_TIMEOUT_MS = 10000;
const HOSTNAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
// Names that only make sense inside a local network: a verify request there would let the
// settings window probe internal services.
const INTERNAL_HOST_SUFFIXES = ['.local', '.internal', '.localhost', '.lan', '.home.arpa'];

function isInternalHost(host) {
  // The URL parser expands shorthand addresses ("127.1", "0x7f.1") into real IPs:
  // check the host the request would actually reach.
  const lower = new URL(`https://${host}`).hostname.toLowerCase();
  return (
    net.isIP(lower) !== 0 ||
    lower === 'localhost' ||
    INTERNAL_HOST_SUFFIXES.some((suffix) => lower.endsWith(suffix))
  );
}

const VERIFY_HTTP_ERRORS = {
  400: 'INVALID_JQL',
  401: 'AUTH_FAILED',
  403: 'AUTH_FAILED',
  404: 'NOT_FOUND',
};

/**
 * Checks one Jira instance on request, from the settings window: a single request, no retries.
 *
 * @param {{domain: string, email: string, apiToken: string, jql: string}} instance - Fields to test.
 * @returns {Promise<{ok: true, count: number, more: boolean}|{ok: false, error: string}>} Number of
 *   issues on the first page, or an error code (MISSING_FIELDS, INVALID_DOMAIN, AUTH_FAILED,
 *   NOT_FOUND, INVALID_JQL, UNREACHABLE, HTTP_<status>).
 */
async function verifyJiraInstance({ domain, email, apiToken, jql }) {
  if (!domain || !email || !apiToken) {
    return { ok: false, error: 'MISSING_FIELDS' };
  }
  const host = domain.trim();
  if (!HOSTNAME_PATTERN.test(host) || isInternalHost(host)) {
    return { ok: false, error: 'INVALID_DOMAIN' };
  }
  const params = new URLSearchParams({
    jql,
    fields: 'summary',
    maxResults: String(MAX_RESULTS_PER_PAGE),
  });
  let response;
  try {
    response = await fetch(`https://${host}/rest/api/3/search/jql?${params}`, {
      method: 'GET',
      headers: { Authorization: buildAuthHeader(email, apiToken), Accept: 'application/json' },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
  } catch (err) {
    console.warn(`Jira [${host}]: verify failed:`, err.message);
    return { ok: false, error: 'UNREACHABLE' };
  }
  if (!response.ok) {
    return { ok: false, error: VERIFY_HTTP_ERRORS[response.status] || `HTTP_${response.status}` };
  }
  const data = await response.json();
  return { ok: true, count: (data.issues || []).length, more: data.isLast === false };
}

/**
 * Chooses which API token a connection test may send.
 *
 * The settings window gets saved tokens masked. When the mask comes back unchanged, the
 * saved token is used, but only for the same site and account it was saved for.
 *
 * @param {{domain: string, email: string, api_token: string}} sent - Fields from the window.
 * @param {{domain: string, email: string, api_token: string}|undefined} saved - Saved instance at that position.
 * @param {string|undefined} maskedToken - The masked value the window received for it.
 * @returns {string|null} Token to send, or null when the saved token must not leave.
 */
function pickVerifyToken(sent, saved, maskedToken) {
  if (!saved || sent.api_token !== maskedToken) {
    return sent.api_token;
  }
  return saved.domain === sent.domain && saved.email === sent.email ? saved.api_token : null;
}

module.exports = {
  verifyJiraInstance,
  pickVerifyToken,
  resolveInstances,
  fetchIssues,
  normalizeIssue,
  mapJiraPriority,
  buildAuthHeader,
};

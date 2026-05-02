'use strict';

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

function normalizeIssue(issue) {
  const dueDate = issue.fields?.duedate;
  const dueAt = dueDate ? new Date(dueDate + 'T23:59:59').getTime() : null;

  return {
    id: `jira_${issue.id}`,
    source: 'jira',
    title: `${issue.key} · ${issue.fields?.summary || '(no title)'}`,
    due_at: dueAt,
    priority: mapJiraPriority(issue.fields?.priority?.name),
    is_done: 0,
    raw_json: JSON.stringify(issue),
    synced_at: Date.now(),
  };
}

async function fetchFromInstance({ domain, email, apiToken, jql }) {
  const authHeader = buildAuthHeader(email, apiToken);
  const baseUrl = `https://${domain}/rest/api/3/search`;
  const fields = 'summary,priority,duedate,status,assignee';

  const issues = [];
  let startAt = 0;
  let total = Infinity;

  while (startAt < total) {
    const params = new URLSearchParams({
      jql,
      fields,
      maxResults: String(MAX_RESULTS_PER_PAGE),
      startAt: String(startAt),
    });

    try {
      const data = await fetchWithRetry(`${baseUrl}?${params}`, {
        method: 'GET',
        headers: {
          Authorization: authHeader,
          Accept: 'application/json',
        },
      });

      total = data.total || 0;
      issues.push(...(data.issues || []).map(normalizeIssue));
      startAt += MAX_RESULTS_PER_PAGE;
    } catch (err) {
      console.error(`Jira [${domain}]: fetch error:`, err.message);
      break;
    }
  }

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

  const results = await Promise.all(
    instances.map((inst) =>
      fetchFromInstance({
        domain: inst.domain,
        email: inst.email,
        apiToken: inst.apiToken || inst.api_token,
        jql: inst.jql || jiraConfig.jql,
      }),
    ),
  );

  return results.flat();
}

module.exports = {
  fetchIssues,
  normalizeIssue,
  mapJiraPriority,
  buildAuthHeader,
};

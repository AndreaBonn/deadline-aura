'use strict';

const { google } = require('googleapis');
const { getAuthenticatedClient, resolveGoogleOAuth } = require('./google-auth');

const { DEFAULT_PRIORITY } = require('../core/task-priority');
const HIGH_PRIORITY = 2;
// Guard against a nextPageToken that never ends: 20 pages of 100 tasks per list.
const MAX_PAGES = 20;
const HIGH_PRIORITY_KEYWORDS = ['urgent', 'deadline', 'critico', 'asap', 'importante'];

function assignPriority(title) {
  const lower = (title || '').toLowerCase();
  for (const kw of HIGH_PRIORITY_KEYWORDS) {
    if (lower.includes(kw)) {
      return HIGH_PRIORITY;
    }
  }
  return DEFAULT_PRIORITY;
}

function normalizeTask(task) {
  if (task.status === 'completed') {
    return null;
  }

  const title = task.title || '(no title)';
  const dueAt = task.due ? new Date(task.due).getTime() : null;

  return {
    id: `gtasks_${task.id}`,
    source: 'gtasks',
    title,
    start_at: null,
    due_at: dueAt,
    priority: assignPriority(title),
    is_done: 0,
    web_url: task.webViewLink || null,
    meet_url: null,
    raw_json: JSON.stringify(task),
    synced_at: Date.now(),
  };
}

// Follow nextPageToken with the same query; the cap guards against a token that never ends.
async function listAllPages(list, params, label) {
  const items = [];
  let pageToken;
  let pages = 0;
  do {
    const response = await list({ ...params, pageToken });
    items.push(...(response.data.items || []));
    pageToken = response.data.nextPageToken || undefined;
    pages += 1;
  } while (pageToken && pages < MAX_PAGES);
  if (pageToken) {
    console.warn(
      `Google Tasks: ${label} still has pages after ${MAX_PAGES}, returning what was read`,
    );
  }
  return items;
}

async function fetchTasks(config) {
  const gcalConfig = config.sources.google_calendar;

  if (!gcalConfig.enabled) {
    return [];
  }

  const { clientId, clientSecret } = resolveGoogleOAuth(config);

  if (!clientId || !clientSecret) {
    return [];
  }

  const oAuth2Client = await getAuthenticatedClient(clientId, clientSecret);
  const service = google.tasks({ version: 'v1', auth: oAuth2Client });

  const allTasks = [];

  try {
    const taskLists = await listAllPages(
      (params) => service.tasklists.list(params),
      { maxResults: 100 },
      'the task lists',
    );

    for (const taskList of taskLists) {
      try {
        const rawTasks = await listAllPages(
          (params) => service.tasks.list(params),
          { tasklist: taskList.id, showCompleted: false, showHidden: false, maxResults: 100 },
          `list "${taskList.title}"`,
        );

        const tasks = rawTasks.map((task) => normalizeTask(task)).filter((t) => t !== null);

        allTasks.push(...tasks);
      } catch (err) {
        console.error(`Google Tasks: error fetching list "${taskList.title}":`, err.message);
        // Partial results would make the daemon mark the failed list's tasks stale.
        throw new Error(`Google Tasks: list "${taskList.title}" could not be fetched`, {
          cause: err,
        });
      }
    }
  } catch (err) {
    console.error('Google Tasks: error fetching task lists:', err.message);
    throw err;
  }

  return allTasks;
}

module.exports = {
  MAX_PAGES,
  fetchTasks,
  normalizeTask,
  assignPriority,
};

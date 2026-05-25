'use strict';

const { google } = require('googleapis');
const { getAuthenticatedClient } = require('./google-calendar');

const DEFAULT_PRIORITY = 3;
const HIGH_PRIORITY = 2;
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

async function fetchTasks(config) {
  const gcalConfig = config.sources.google_calendar;

  if (!gcalConfig.enabled) {
    return [];
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return [];
  }

  const oAuth2Client = await getAuthenticatedClient(clientId, clientSecret);
  const service = google.tasks({ version: 'v1', auth: oAuth2Client });

  const allTasks = [];

  try {
    const taskListsResponse = await service.tasklists.list({ maxResults: 100 });
    const taskLists = taskListsResponse.data.items || [];

    for (const taskList of taskLists) {
      try {
        const tasksResponse = await service.tasks.list({
          tasklist: taskList.id,
          showCompleted: false,
          showHidden: false,
          maxResults: 100,
        });

        const tasks = (tasksResponse.data.items || [])
          .map((task) => normalizeTask(task))
          .filter((t) => t !== null);

        allTasks.push(...tasks);
      } catch (err) {
        console.error(`Google Tasks: error fetching list "${taskList.title}":`, err.message);
      }
    }
  } catch (err) {
    console.error('Google Tasks: error fetching task lists:', err.message);
    throw err;
  }

  return allTasks;
}

module.exports = {
  fetchTasks,
  normalizeTask,
  assignPriority,
};

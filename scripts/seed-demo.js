'use strict';

const db = require('../store/db');

const NOW = Date.now();
const HOUR = 3600000;

const demoTasks = [
  {
    id: 'demo-1',
    source: 'gcal',
    title: 'Deploy produzione v2.1',
    due_at: NOW + 3 * HOUR,
    priority: 1,
    is_done: 0,
    raw_json: null,
    synced_at: NOW,
  },
  {
    id: 'demo-2',
    source: 'jira',
    title: 'Fix bug autenticazione OAuth',
    due_at: NOW + 8 * HOUR,
    priority: 1,
    is_done: 0,
    raw_json: null,
    synced_at: NOW,
  },
  {
    id: 'demo-3',
    source: 'gcal',
    title: 'Call con cliente - review sprint',
    due_at: NOW + 24 * HOUR,
    priority: 2,
    is_done: 0,
    raw_json: null,
    synced_at: NOW,
  },
  {
    id: 'demo-4',
    source: 'jira',
    title: 'Refactoring modulo pagamenti',
    due_at: NOW + 48 * HOUR,
    priority: 2,
    is_done: 0,
    raw_json: null,
    synced_at: NOW,
  },
  {
    id: 'demo-5',
    source: 'gcal',
    title: 'Presentazione roadmap Q3',
    due_at: NOW + 60 * HOUR,
    priority: 3,
    is_done: 0,
    raw_json: null,
    synced_at: NOW,
  },
  {
    id: 'demo-6',
    source: 'jira',
    title: 'Update documentazione API',
    due_at: NOW + 72 * HOUR,
    priority: 4,
    is_done: 0,
    raw_json: null,
    synced_at: NOW,
  },
];

// Pulisci task esistenti prima di inserire demo
db.getDb().prepare('DELETE FROM tasks').run();
db.getDb().prepare('DELETE FROM scores').run();

for (const task of demoTasks) {
  db.upsertTask(task);
}

console.log(`Cleaned DB and inserted ${demoTasks.length} demo tasks.`);
db.close();

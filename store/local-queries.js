'use strict';

const crypto = require('crypto');
const { getDb, upsertTask } = require('./db');
const { unpinTaskFromAll } = require('./pinned-queries');

function generateLocalId() {
  const timestamp = Date.now();
  const random = crypto.randomBytes(4).toString('hex');
  return `local_${timestamp}_${random}`;
}

function createLocalTask({ title, dueAt, priority }) {
  const id = generateLocalId();
  upsertTask({
    id,
    source: 'local',
    title,
    due_at: dueAt || null,
    start_at: null,
    priority: priority || 3,
    is_done: 0,
    web_url: null,
    raw_json: null,
    synced_at: Date.now(),
  });
  return id;
}

function updateLocalTask({ id, title, dueAt, priority }) {
  const fields = [];
  const params = [];

  if (title !== undefined) {
    fields.push('title = ?');
    params.push(title);
  }
  if (dueAt !== undefined) {
    fields.push('due_at = ?');
    params.push(dueAt);
  }
  if (priority !== undefined) {
    fields.push('priority = ?');
    params.push(priority);
  }

  if (fields.length === 0) {
    return { changes: 0 };
  }

  params.push(id);
  return getDb()
    .prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ? AND source = 'local'`)
    .run(...params);
}

function deleteLocalTask(id) {
  unpinTaskFromAll(id);
  return getDb()
    .prepare("DELETE FROM tasks WHERE id = ? AND source = 'local'")
    .run(id);
}

function completeLocalTask(id) {
  unpinTaskFromAll(id);
  return getDb()
    .prepare("UPDATE tasks SET is_done = 1 WHERE id = ? AND source = 'local'")
    .run(id);
}

function getAllLocalTasks() {
  return getDb()
    .prepare(
      `SELECT * FROM tasks
       WHERE source = 'local' AND is_done = 0
       ORDER BY due_at IS NULL, due_at ASC, priority ASC`,
    )
    .all();
}

module.exports = {
  createLocalTask,
  updateLocalTask,
  deleteLocalTask,
  completeLocalTask,
  getAllLocalTasks,
};

'use strict';

const { getDb } = require('./db');

function pinTask({ taskId, displayId }) {
  return getDb()
    .prepare(
      `INSERT OR IGNORE INTO pinned_tasks (task_id, display_id, x_pct, y_pct, pinned_at)
       VALUES (?, ?, 10.0, 10.0, ?)`,
    )
    .run(taskId, displayId, Date.now());
}

function unpinTask({ taskId, displayId }) {
  return getDb()
    .prepare('DELETE FROM pinned_tasks WHERE task_id = ? AND display_id = ?')
    .run(taskId, displayId);
}

function unpinTaskFromAll(taskId) {
  return getDb().prepare('DELETE FROM pinned_tasks WHERE task_id = ?').run(taskId);
}

function updatePosition({ taskId, displayId, xPct, yPct }) {
  return getDb()
    .prepare('UPDATE pinned_tasks SET x_pct = ?, y_pct = ? WHERE task_id = ? AND display_id = ?')
    .run(xPct, yPct, taskId, displayId);
}

function updatePositions(positions) {
  const stmt = getDb().prepare(
    'UPDATE pinned_tasks SET x_pct = ?, y_pct = ? WHERE task_id = ? AND display_id = ?',
  );
  const tx = getDb().transaction((items) => {
    for (const p of items) {
      stmt.run(p.xPct, p.yPct, p.taskId, p.displayId);
    }
  });
  tx(positions);
}

function getByDisplay(displayId) {
  return getDb()
    .prepare(
      `SELECT pt.task_id, pt.display_id, pt.x_pct, pt.y_pct, pt.pinned_at,
              t.title, t.source, t.due_at, t.priority, t.web_url
       FROM pinned_tasks pt
       JOIN tasks t ON t.id = pt.task_id
       WHERE pt.display_id = ? AND t.is_stale = 0
       ORDER BY pt.pinned_at ASC`,
    )
    .all(displayId);
}

function getAllPinned() {
  return getDb()
    .prepare(
      `SELECT pt.task_id, pt.display_id, pt.x_pct, pt.y_pct, pt.pinned_at,
              t.title, t.source, t.due_at, t.priority, t.web_url
       FROM pinned_tasks pt
       JOIN tasks t ON t.id = pt.task_id
       WHERE t.is_stale = 0
       ORDER BY pt.pinned_at ASC`,
    )
    .all();
}

function unpinStaleTasks() {
  return getDb()
    .prepare(
      `DELETE FROM pinned_tasks WHERE task_id IN (
         SELECT id FROM tasks WHERE is_stale = 1
       )`,
    )
    .run();
}

function isPinned(taskId) {
  const row = getDb().prepare('SELECT 1 FROM pinned_tasks WHERE task_id = ? LIMIT 1').get(taskId);
  return !!row;
}

module.exports = {
  pinTask,
  unpinTask,
  unpinTaskFromAll,
  unpinStaleTasks,
  updatePosition,
  updatePositions,
  getByDisplay,
  getAllPinned,
  isPinned,
};

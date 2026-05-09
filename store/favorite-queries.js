'use strict';

const { getDb } = require('./db');

function favoriteTask(taskId) {
  return getDb()
    .prepare(
      `INSERT OR IGNORE INTO jira_favorites (task_id, favorited_at)
       VALUES (?, ?)`,
    )
    .run(taskId, Date.now());
}

function unfavoriteTask(taskId) {
  return getDb()
    .prepare('DELETE FROM jira_favorites WHERE task_id = ?')
    .run(taskId);
}

function getAllFavoriteIds() {
  return getDb()
    .prepare('SELECT task_id FROM jira_favorites ORDER BY favorited_at ASC')
    .all()
    .map((row) => row.task_id);
}

function isFavorite(taskId) {
  const row = getDb()
    .prepare('SELECT 1 FROM jira_favorites WHERE task_id = ? LIMIT 1')
    .get(taskId);
  return !!row;
}

module.exports = {
  favoriteTask,
  unfavoriteTask,
  getAllFavoriteIds,
  isFavorite,
};

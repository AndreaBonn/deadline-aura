'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { runMigrations } = require('./migrations');
const { CALENDAR_SOURCES_SQL } = require('../core/calendar-sources');

const DATA_DIR = path.join(os.homedir(), '.local', 'share', 'deadlineaura');
const DB_PATH = path.join(DATA_DIR, 'db.sqlite');

const MS_PER_HOUR = 3600000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const SCORE_RETENTION_DAYS = 7;
const STALE_TASK_TTL_HOURS = 48;

let db = null;

function getDb() {
  if (db) {
    return db;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db, { dbPath: DB_PATH });

  return db;
}

function getActiveTasks(lookaheadMs) {
  const deadline = Date.now() + lookaheadMs;
  // Jira + local tasks: no lookahead limit, never stale from sync
  const persistentTasks = getDb()
    .prepare(
      `SELECT * FROM tasks
     WHERE is_done = 0
       AND is_stale = 0
       AND source IN ('jira', 'local', 'gtasks')
     ORDER BY due_at IS NULL, due_at ASC, priority ASC`,
    )
    .all();
  const now = Date.now();
  const otherTasks = getDb()
    .prepare(
      `SELECT * FROM tasks
     WHERE is_done = 0
       AND is_stale = 0
       AND source NOT IN ('jira', 'local', 'gtasks')
       AND (due_at IS NULL OR (due_at >= ? AND due_at <= ?))
     ORDER BY due_at IS NULL, due_at ASC, priority ASC`,
    )
    .all(now, deadline);
  return [...persistentTasks, ...otherTasks];
}

function getUpcomingCalendarEvents(horizonMs) {
  const now = Date.now();
  const horizon = now + horizonMs;
  return getDb()
    .prepare(
      `SELECT * FROM tasks
     WHERE is_done = 0
       AND is_stale = 0
       AND source IN (${CALENDAR_SOURCES_SQL})
       AND (
         (start_at IS NOT NULL AND start_at >= ? AND start_at <= ?)
         OR (start_at IS NULL AND due_at IS NOT NULL AND due_at >= ? AND due_at <= ?)
       )
     ORDER BY COALESCE(start_at, due_at) ASC`,
    )
    .all(now, horizon, now, horizon);
}

function getUpcomingMeetings(beforeMinutes, afterMinutes) {
  const now = Date.now();
  const windowStart = now + afterMinutes * 60000;
  const windowEnd = now + beforeMinutes * 60000;
  return getDb()
    .prepare(
      `SELECT * FROM tasks
     WHERE is_done = 0
       AND is_stale = 0
       AND source = 'gcal'
       AND meet_url IS NOT NULL
       AND start_at IS NOT NULL
       AND start_at <= ?
       AND start_at >= ?
     ORDER BY start_at ASC`,
    )
    .all(windowEnd, windowStart);
}

function upsertTask(task) {
  const stmt = getDb().prepare(`
    INSERT INTO tasks (id, source, title, due_at, start_at, priority, is_done, is_stale, web_url, meet_url, raw_json, synced_at)
    VALUES (@id, @source, @title, @due_at, @start_at, @priority, @is_done, 0, @web_url, @meet_url, @raw_json, @synced_at)
    ON CONFLICT(id) DO UPDATE SET
      title = @title,
      due_at = @due_at,
      start_at = @start_at,
      priority = @priority,
      is_done = @is_done,
      is_stale = 0,
      web_url = @web_url,
      meet_url = @meet_url,
      raw_json = @raw_json,
      synced_at = @synced_at
  `);
  return stmt.run({ start_at: null, web_url: null, meet_url: null, ...task });
}

function markStale(source, activeIds) {
  if (activeIds.length === 0) {
    getDb().prepare('UPDATE tasks SET is_stale = 1 WHERE source = ? AND is_stale = 0').run(source);
    return;
  }

  const placeholders = activeIds.map(() => '?').join(',');
  getDb()
    .prepare(
      `UPDATE tasks SET is_stale = 1
     WHERE source = ? AND is_stale = 0 AND id NOT IN (${placeholders})`,
    )
    .run(source, ...activeIds);
}

function updateAiScores(taskId, { stress, category, reasoning, cognitive_type }) {
  getDb()
    .prepare(
      `UPDATE tasks SET
      ai_stress = ?, ai_category = ?, ai_reasoning = ?, ai_cognitive_type = ?, ai_scored_at = ?
     WHERE id = ?`,
    )
    .run(stress, category, reasoning, cognitive_type || null, Date.now(), taskId);
}

function saveGlobalScore(score) {
  getDb()
    .prepare('INSERT INTO scores (global_score, computed_at) VALUES (?, ?)')
    .run(score, Date.now());
}

function getLastGlobalScore() {
  return getDb()
    .prepare('SELECT global_score, computed_at FROM scores ORDER BY computed_at DESC LIMIT 1')
    .get();
}

function getLatestAiScore() {
  const row = getDb()
    .prepare('SELECT response_json, computed_at FROM ai_cache ORDER BY computed_at DESC LIMIT 1')
    .get();
  if (!row) {
    return null;
  }
  try {
    const parsed = JSON.parse(row.response_json);
    return { global_stress: parsed.global_stress, computed_at: row.computed_at };
  } catch {
    return null;
  }
}

function getLatestAiCacheResponse() {
  const row = getDb()
    .prepare('SELECT response_json FROM ai_cache ORDER BY computed_at DESC, rowid DESC LIMIT 1')
    .get();
  if (!row) {
    return null;
  }
  try {
    return JSON.parse(row.response_json);
  } catch {
    return null;
  }
}

function getScoreHistory(days) {
  const since = Date.now() - days * MS_PER_DAY;
  return getDb()
    .prepare(
      'SELECT global_score, computed_at FROM scores WHERE computed_at >= ? ORDER BY computed_at ASC',
    )
    .all(since);
}

function getAiCacheHistory(days) {
  const since = Date.now() - days * MS_PER_DAY;
  return getDb()
    .prepare(
      'SELECT response_json, computed_at FROM ai_cache WHERE computed_at >= ? ORDER BY computed_at ASC',
    )
    .all(since);
}

function getAiCache(eventsHash) {
  return getDb().prepare('SELECT * FROM ai_cache WHERE events_hash = ?').get(eventsHash);
}

function setAiCache(eventsHash, responseJson) {
  getDb()
    .prepare(
      `INSERT OR REPLACE INTO ai_cache (events_hash, response_json, computed_at)
     VALUES (?, ?, ?)`,
    )
    .run(eventsHash, responseJson, Date.now());
}

function deleteTask(taskId) {
  return getDb().prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
}

function markTaskDone(taskId) {
  return getDb().prepare('UPDATE tasks SET is_done = 1 WHERE id = ?').run(taskId);
}

function cleanupOldRecords() {
  const sevenDaysAgo = Date.now() - SCORE_RETENTION_DAYS * MS_PER_DAY;
  const fortyEightHoursAgo = Date.now() - STALE_TASK_TTL_HOURS * MS_PER_HOUR;

  getDb().prepare('DELETE FROM scores WHERE computed_at < ?').run(sevenDaysAgo);
  getDb().prepare('DELETE FROM tasks WHERE is_stale = 1 AND synced_at < ?').run(fortyEightHoursAgo);
  getDb().prepare('DELETE FROM ai_cache WHERE computed_at < ?').run(sevenDaysAgo);
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDb,
  getActiveTasks,
  getUpcomingCalendarEvents,
  getUpcomingMeetings,
  upsertTask,
  markStale,
  updateAiScores,
  saveGlobalScore,
  getLastGlobalScore,
  getLatestAiScore,
  getLatestAiCacheResponse,
  getScoreHistory,
  getAiCacheHistory,
  getAiCache,
  setAiCache,
  deleteTask,
  markTaskDone,
  cleanupOldRecords,
  close,
  DB_PATH,
  DATA_DIR,
};

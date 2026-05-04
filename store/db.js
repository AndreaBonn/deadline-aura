'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

const DATA_DIR = path.join(os.homedir(), '.local', 'share', 'deadlineaura');
const DB_PATH = path.join(DATA_DIR, 'db.sqlite');

let db = null;

function getDb() {
  if (db) {
    return db;
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations(db);

  return db;
}

function runMigrations(database) {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    database.exec(sql);
  }

  // 002: add web_url column (idempotent)
  const columns = database.pragma('table_info(tasks)');
  const columnNames = new Set(columns.map((col) => col.name));

  if (!columnNames.has('web_url')) {
    database.exec('ALTER TABLE tasks ADD COLUMN web_url TEXT');
  }

  // 004: add ai_cognitive_type column (idempotent)
  // Valid values must stay in sync with VALID_COGNITIVE_TYPES in ai/prompt.js
  if (!columnNames.has('ai_cognitive_type')) {
    database.exec(
      "ALTER TABLE tasks ADD COLUMN ai_cognitive_type TEXT CHECK(ai_cognitive_type IN ('analytical', 'creative', 'social', 'passive', 'administrative'))",
    );
  }

  // 005: add start_at column for calendar event start times (idempotent)
  if (!columnNames.has('start_at')) {
    database.exec('ALTER TABLE tasks ADD COLUMN start_at INTEGER');
  }

  // 005b: backfill start_at from raw_json for existing gcal events
  const needsBackfill = database
    .prepare(
      "SELECT id, raw_json FROM tasks WHERE source = 'gcal' AND start_at IS NULL AND raw_json IS NOT NULL",
    )
    .all();
  if (needsBackfill.length > 0) {
    const update = database.prepare('UPDATE tasks SET start_at = ? WHERE id = ?');
    const backfill = database.transaction((rows) => {
      for (const row of rows) {
        try {
          const event = JSON.parse(row.raw_json);
          const startAt = event.start?.dateTime
            ? new Date(event.start.dateTime).getTime()
            : event.start?.date
              ? new Date(event.start.date + 'T00:00:00').getTime()
              : null;
          if (startAt) {
            update.run(startAt, row.id);
          }
        } catch {
          // skip malformed raw_json
        }
      }
    });
    backfill(needsBackfill);
  }
}

function getActiveTasks(lookaheadMs) {
  const deadline = Date.now() + lookaheadMs;
  const jiraTasks = getDb()
    .prepare(
      `SELECT * FROM tasks
     WHERE is_done = 0
       AND is_stale = 0
       AND source = 'jira'
     ORDER BY due_at IS NULL, due_at ASC, priority ASC`,
    )
    .all();
  const otherTasks = getDb()
    .prepare(
      `SELECT * FROM tasks
     WHERE is_done = 0
       AND is_stale = 0
       AND source != 'jira'
       AND (due_at IS NULL OR due_at <= ?)
     ORDER BY due_at IS NULL, due_at ASC, priority ASC`,
    )
    .all(deadline);
  return [...jiraTasks, ...otherTasks];
}

function getUpcomingCalendarEvents(horizonMs) {
  const now = Date.now();
  const horizon = now + horizonMs;
  return getDb()
    .prepare(
      `SELECT * FROM tasks
     WHERE is_done = 0
       AND is_stale = 0
       AND source = 'gcal'
       AND (
         (start_at IS NOT NULL AND start_at >= ? AND start_at <= ?)
         OR (start_at IS NULL AND due_at IS NOT NULL AND due_at >= ? AND due_at <= ?)
       )
     ORDER BY COALESCE(start_at, due_at) ASC`,
    )
    .all(now, horizon, now, horizon);
}

function upsertTask(task) {
  const stmt = getDb().prepare(`
    INSERT INTO tasks (id, source, title, due_at, start_at, priority, is_done, is_stale, web_url, raw_json, synced_at)
    VALUES (@id, @source, @title, @due_at, @start_at, @priority, @is_done, 0, @web_url, @raw_json, @synced_at)
    ON CONFLICT(id) DO UPDATE SET
      title = @title,
      due_at = @due_at,
      start_at = @start_at,
      priority = @priority,
      is_done = @is_done,
      is_stale = 0,
      web_url = @web_url,
      raw_json = @raw_json,
      synced_at = @synced_at
  `);
  return stmt.run({ start_at: null, ...task });
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

function cleanupOldRecords() {
  const sevenDaysAgo = Date.now() - 7 * 24 * 3600000;
  const fortyEightHoursAgo = Date.now() - 48 * 3600000;

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
  upsertTask,
  markStale,
  updateAiScores,
  saveGlobalScore,
  getLastGlobalScore,
  getLatestAiScore,
  getAiCache,
  setAiCache,
  cleanupOldRecords,
  close,
  DB_PATH,
  DATA_DIR,
};

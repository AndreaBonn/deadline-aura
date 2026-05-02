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
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
    database.exec(sql);
  }
}

function getActiveTasks(lookaheadMs) {
  const deadline = Date.now() + lookaheadMs;
  return getDb()
    .prepare(
      `SELECT * FROM tasks
     WHERE is_done = 0
       AND is_stale = 0
       AND (due_at IS NULL OR due_at <= ?)
     ORDER BY due_at IS NULL, due_at ASC, priority ASC`,
    )
    .all(deadline);
}

function upsertTask(task) {
  const stmt = getDb().prepare(`
    INSERT INTO tasks (id, source, title, due_at, priority, is_done, is_stale, raw_json, synced_at)
    VALUES (@id, @source, @title, @due_at, @priority, @is_done, 0, @raw_json, @synced_at)
    ON CONFLICT(id) DO UPDATE SET
      title = @title,
      due_at = @due_at,
      priority = @priority,
      is_done = @is_done,
      is_stale = 0,
      raw_json = @raw_json,
      synced_at = @synced_at
  `);
  return stmt.run(task);
}

function markStale(source, activeIds) {
  if (activeIds.length === 0) {
    getDb()
      .prepare('UPDATE tasks SET is_stale = 1 WHERE source = ? AND is_stale = 0')
      .run(source);
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

function updateAiScores(taskId, { stress, category, reasoning }) {
  getDb()
    .prepare(
      `UPDATE tasks SET
      ai_stress = ?, ai_category = ?, ai_reasoning = ?, ai_scored_at = ?
     WHERE id = ?`,
    )
    .run(stress, category, reasoning, Date.now(), taskId);
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
  getDb()
    .prepare('DELETE FROM tasks WHERE is_stale = 1 AND synced_at < ?')
    .run(fortyEightHoursAgo);
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
  upsertTask,
  markStale,
  updateAiScores,
  saveGlobalScore,
  getLastGlobalScore,
  getAiCache,
  setAiCache,
  cleanupOldRecords,
  close,
  DB_PATH,
  DATA_DIR,
};

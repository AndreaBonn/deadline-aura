'use strict';

const fs = require('fs');
const path = require('path');
const dbBackup = require('./db-backup');
const { eventBoundaryMs, extractMeetUrl } = require('../core/event-fields');

const TASKS_COLUMNS = `id, source, title, due_at, priority, is_done, is_stale,
    raw_json, synced_at, ai_stress, ai_category, ai_reasoning, ai_scored_at,
    web_url, ai_cognitive_type, start_at, meet_url`;

const GTASKS_SCHEMA = `CREATE TABLE IF NOT EXISTS tasks_new (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL CHECK(source IN ('gcal', 'jira', 'local', 'gtasks')),
  title       TEXT NOT NULL,
  due_at      INTEGER,
  priority    INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 4),
  is_done     INTEGER NOT NULL DEFAULT 0,
  is_stale    INTEGER NOT NULL DEFAULT 0,
  raw_json    TEXT,
  synced_at   INTEGER NOT NULL,
  ai_stress     INTEGER CHECK(ai_stress BETWEEN 1 AND 10),
  ai_category   TEXT CHECK(ai_category IN ('work-critical', 'work-routine', 'personal', 'admin')),
  ai_reasoning  TEXT,
  ai_scored_at  INTEGER,
  web_url     TEXT,
  ai_cognitive_type TEXT CHECK(ai_cognitive_type IN ('analytical', 'creative', 'social', 'passive', 'administrative')),
  start_at    INTEGER,
  meet_url    TEXT
);`;

const OFF_CATEGORY_SCHEMA = `CREATE TABLE IF NOT EXISTS tasks_new (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL CHECK(source IN ('gcal', 'jira', 'local', 'gtasks')),
  title       TEXT NOT NULL,
  due_at      INTEGER,
  priority    INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 4),
  is_done     INTEGER NOT NULL DEFAULT 0,
  is_stale    INTEGER NOT NULL DEFAULT 0,
  raw_json    TEXT,
  synced_at   INTEGER NOT NULL,
  ai_stress     INTEGER CHECK(ai_stress BETWEEN 1 AND 10),
  ai_category   TEXT CHECK(ai_category IN ('work-critical', 'work-routine', 'personal', 'admin', 'off')),
  ai_reasoning  TEXT,
  ai_scored_at  INTEGER,
  web_url     TEXT,
  ai_cognitive_type TEXT CHECK(ai_cognitive_type IN ('analytical', 'creative', 'social', 'passive', 'administrative')),
  start_at    INTEGER,
  meet_url    TEXT
);`;

const OUTLOOK_SCHEMA = `CREATE TABLE tasks_new (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL CHECK(source IN ('gcal', 'jira', 'local', 'gtasks', 'outlook')),
  title       TEXT NOT NULL,
  due_at      INTEGER,
  priority    INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 4),
  is_done     INTEGER NOT NULL DEFAULT 0,
  is_stale    INTEGER NOT NULL DEFAULT 0,
  raw_json    TEXT,
  synced_at   INTEGER NOT NULL,
  ai_stress     INTEGER CHECK(ai_stress BETWEEN 1 AND 10),
  ai_category   TEXT CHECK(ai_category IN ('work-critical', 'work-routine', 'personal', 'admin', 'off')),
  ai_reasoning  TEXT,
  ai_scored_at  INTEGER,
  web_url     TEXT,
  ai_cognitive_type TEXT CHECK(ai_cognitive_type IN ('analytical', 'creative', 'social', 'passive', 'administrative')),
  start_at    INTEGER,
  meet_url    TEXT
);`;

/**
 * Report whether the tasks table already accepts a given source value.
 *
 * @param {object} database - Open better-sqlite3 handle.
 * @param {string} value - Source value to look for.
 * @returns {boolean} True when the source CHECK lists the value.
 */
function sourceCheckAccepts(database, value) {
  const table = database
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")
    .get();
  if (!table) {
    return false;
  }

  const match = table.sql.match(/CHECK\s*\(\s*source\s+IN\s*\(([^)]*)\)/i);
  if (!match) {
    return false;
  }

  return match[1]
    .split(',')
    .map((entry) => entry.trim().replace(/^'|'$/g, ''))
    .includes(value);
}

function runSqlMigrations(database) {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    database.exec(fs.readFileSync(path.join(migrationsDir, file), 'utf-8'));
  }
}

function addWebUrl(database, columnNames) {
  if (!columnNames.has('web_url')) {
    database.exec('ALTER TABLE tasks ADD COLUMN web_url TEXT');
  }
}

function addCognitiveType(database, columnNames) {
  // Valid values must stay in sync with VALID_COGNITIVE_TYPES in ai/prompt.js.
  if (!columnNames.has('ai_cognitive_type')) {
    database.exec(
      "ALTER TABLE tasks ADD COLUMN ai_cognitive_type TEXT CHECK(ai_cognitive_type IN ('analytical', 'creative', 'social', 'passive', 'administrative'))",
    );
  }
}

function addStartAt(database, columnNames) {
  if (!columnNames.has('start_at')) {
    database.exec('ALTER TABLE tasks ADD COLUMN start_at INTEGER');
  }
}

function backfillStartAt(database) {
  const rows = database
    .prepare(
      "SELECT id, raw_json FROM tasks WHERE source = 'gcal' AND start_at IS NULL AND raw_json IS NOT NULL",
    )
    .all();
  if (rows.length === 0) {
    return;
  }
  const update = database.prepare('UPDATE tasks SET start_at = ? WHERE id = ?');
  database.transaction((entries) => {
    for (const row of entries) {
      try {
        const event = JSON.parse(row.raw_json);
        const startAt = eventBoundaryMs(event.start);
        if (startAt) {
          update.run(startAt, row.id);
        }
      } catch {
        // Preserve the legacy behavior: malformed event data is skipped.
      }
    }
  })(rows);
}

function addMeetUrl(database, columnNames) {
  if (!columnNames.has('meet_url')) {
    database.exec('ALTER TABLE tasks ADD COLUMN meet_url TEXT');
  }
}

function backfillMeetUrl(database) {
  const rows = database
    .prepare(
      "SELECT id, raw_json FROM tasks WHERE source = 'gcal' AND meet_url IS NULL AND raw_json IS NOT NULL",
    )
    .all();
  if (rows.length === 0) {
    return;
  }
  const update = database.prepare('UPDATE tasks SET meet_url = ? WHERE id = ?');
  database.transaction((entries) => {
    for (const row of entries) {
      try {
        const event = JSON.parse(row.raw_json);
        const meetUrl = extractMeetUrl(event);
        if (meetUrl) {
          update.run(meetUrl, row.id);
        }
      } catch {
        // Preserve the legacy behavior: malformed event data is skipped.
      }
    }
  })(rows);
}

function backupBeforeRebuild(database, dbPath, migrationLabel) {
  try {
    const backupPath = dbBackup.createBackup(database, dbPath, migrationLabel);
    console.log(`[migrations] ${migrationLabel} backup → ${backupPath}`);
  } catch (err) {
    throw new Error(
      `Aborting ${migrationLabel}: backup failed (${err.message}). ` +
        `Refusing to run a destructive migration without a recovery point.`,
    );
  }
}

function rebuildTasksTable(database, { dbPath, schema, migrationLabel }) {
  backupBeforeRebuild(database, dbPath, migrationLabel);
  // Disabling foreign keys preserves pins/favorites across DROP TABLE tasks.
  const fkWasOn = database.pragma('foreign_keys', { simple: true }) === 1;
  if (fkWasOn) {
    database.pragma('foreign_keys = OFF');
  }
  try {
    // Atomic replacement also discards tasks_new left by an interrupted rebuild.
    database.transaction(() => {
      database.exec(`
        DROP TABLE IF EXISTS tasks_new;
        ${schema}
        INSERT INTO tasks_new SELECT ${TASKS_COLUMNS} FROM tasks;
        DROP TABLE tasks;
        ALTER TABLE tasks_new RENAME TO tasks;
        CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks(due_at);
        CREATE INDEX IF NOT EXISTS idx_tasks_is_done ON tasks(is_done);
        CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source);
      `);
    })();
  } finally {
    if (fkWasOn) {
      database.pragma('foreign_keys = ON');
    }
  }
}

function extendGtasksSource(database, dbPath) {
  const table = database
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")
    .get();
  if (table && !table.sql.includes("'gtasks'")) {
    rebuildTasksTable(database, {
      dbPath,
      schema: GTASKS_SCHEMA,
      migrationLabel: 'mig-006-gtasks',
    });
  }
}

function extendOffCategory(database, dbPath) {
  const table = database
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'")
    .get();
  if (table && !table.sql.includes("'off'")) {
    rebuildTasksTable(database, {
      dbPath,
      schema: OFF_CATEGORY_SCHEMA,
      migrationLabel: 'mig-007-off-category',
    });
  }
}

function extendOutlookSource(database, dbPath) {
  // Inspect only the source CHECK: 'outlook' in another column is not sufficient.
  if (!sourceCheckAccepts(database, 'outlook')) {
    rebuildTasksTable(database, {
      dbPath,
      schema: OUTLOOK_SCHEMA,
      migrationLabel: 'mig-008-outlook',
    });
  }
}

function runMigrations(database, { dbPath }) {
  runSqlMigrations(database);
  const columnNames = new Set(database.pragma('table_info(tasks)').map((column) => column.name));
  addWebUrl(database, columnNames);
  addCognitiveType(database, columnNames);
  addStartAt(database, columnNames);
  backfillStartAt(database);
  addMeetUrl(database, columnNames);
  backfillMeetUrl(database);
  extendGtasksSource(database, dbPath);
  extendOffCategory(database, dbPath);
  extendOutlookSource(database, dbPath);
}

module.exports = { runMigrations };

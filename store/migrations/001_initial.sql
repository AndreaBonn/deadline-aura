CREATE TABLE IF NOT EXISTS tasks (
  id          TEXT PRIMARY KEY,
  source      TEXT NOT NULL CHECK(source IN ('gcal', 'jira')),
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
  ai_scored_at  INTEGER
);

CREATE TABLE IF NOT EXISTS scores (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  global_score  REAL NOT NULL,
  computed_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_cache (
  events_hash   TEXT PRIMARY KEY,
  response_json TEXT NOT NULL,
  computed_at   INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_due_at ON tasks(due_at);
CREATE INDEX IF NOT EXISTS idx_tasks_is_done ON tasks(is_done);
CREATE INDEX IF NOT EXISTS idx_tasks_source ON tasks(source);
CREATE INDEX IF NOT EXISTS idx_scores_computed_at ON scores(computed_at);

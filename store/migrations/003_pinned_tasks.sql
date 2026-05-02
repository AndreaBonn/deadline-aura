CREATE TABLE IF NOT EXISTS pinned_tasks (
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  display_id  TEXT NOT NULL,
  x_pct       REAL NOT NULL DEFAULT 10.0 CHECK(x_pct >= 0 AND x_pct <= 100),
  y_pct       REAL NOT NULL DEFAULT 10.0 CHECK(y_pct >= 0 AND y_pct <= 100),
  pinned_at   INTEGER NOT NULL,
  PRIMARY KEY (task_id, display_id)
);

CREATE INDEX IF NOT EXISTS idx_pinned_display ON pinned_tasks(display_id);

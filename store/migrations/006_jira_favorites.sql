CREATE TABLE IF NOT EXISTS jira_favorites (
  task_id       TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  favorited_at  INTEGER NOT NULL,
  PRIMARY KEY (task_id)
);

CREATE INDEX IF NOT EXISTS idx_jira_favorites_task ON jira_favorites(task_id);

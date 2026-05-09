'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

vi.spyOn(os, 'homedir').mockReturnValue(
  path.join(os.tmpdir(), 'deadlineaura-fav-test-home-' + process.pid),
);

const db = require('../../store/db');
const favoriteQueries = require('../../store/favorite-queries');

function insertBaseTask(id, overrides = {}) {
  db.upsertTask({
    id,
    source: 'jira',
    title: 'Test Task',
    due_at: Date.now() + 24 * 3600000,
    priority: 3,
    is_done: 0,
    web_url: null,
    raw_json: '{}',
    synced_at: Date.now(),
    ...overrides,
  });
}

afterAll(() => {
  db.close();
  const dataDir = path.join(
    os.tmpdir(),
    'deadlineaura-fav-test-home-' + process.pid,
    '.local',
    'share',
    'deadlineaura',
  );
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

describe('favorite-queries', () => {
  beforeEach(() => {
    db.getDb().exec('DELETE FROM jira_favorites');
    db.getDb().exec("DELETE FROM tasks WHERE source = 'jira'");
  });

  describe('favoriteTask', () => {
    it('adds a task to favorites', () => {
      insertBaseTask('JIRA-1');

      favoriteQueries.favoriteTask('JIRA-1');

      expect(favoriteQueries.isFavorite('JIRA-1')).toBe(true);
    });

    it('ignores duplicate favorites', () => {
      insertBaseTask('JIRA-2');

      favoriteQueries.favoriteTask('JIRA-2');
      favoriteQueries.favoriteTask('JIRA-2');

      const ids = favoriteQueries.getAllFavoriteIds();
      expect(ids.filter((id) => id === 'JIRA-2')).toHaveLength(1);
    });
  });

  describe('unfavoriteTask', () => {
    it('removes a task from favorites', () => {
      insertBaseTask('JIRA-3');
      favoriteQueries.favoriteTask('JIRA-3');

      favoriteQueries.unfavoriteTask('JIRA-3');

      expect(favoriteQueries.isFavorite('JIRA-3')).toBe(false);
    });

    it('does nothing when task is not favorited', () => {
      insertBaseTask('JIRA-4');

      const result = favoriteQueries.unfavoriteTask('JIRA-4');

      expect(result.changes).toBe(0);
    });
  });

  describe('getAllFavoriteIds', () => {
    it('returns favorited task IDs in chronological order', () => {
      insertBaseTask('JIRA-A');
      insertBaseTask('JIRA-B');

      favoriteQueries.favoriteTask('JIRA-A');
      favoriteQueries.favoriteTask('JIRA-B');

      expect(favoriteQueries.getAllFavoriteIds()).toEqual(['JIRA-A', 'JIRA-B']);
    });

    it('returns empty array when no favorites', () => {
      expect(favoriteQueries.getAllFavoriteIds()).toEqual([]);
    });
  });

  describe('isFavorite', () => {
    it('returns true for favorited tasks', () => {
      insertBaseTask('JIRA-5');
      favoriteQueries.favoriteTask('JIRA-5');

      expect(favoriteQueries.isFavorite('JIRA-5')).toBe(true);
    });

    it('returns false for non-favorited tasks', () => {
      expect(favoriteQueries.isFavorite('JIRA-NONE')).toBe(false);
    });
  });

  describe('cascade delete', () => {
    it('removes favorite when parent task is deleted', () => {
      insertBaseTask('JIRA-DEL');
      favoriteQueries.favoriteTask('JIRA-DEL');

      db.deleteTask('JIRA-DEL');

      expect(favoriteQueries.isFavorite('JIRA-DEL')).toBe(false);
    });
  });
});

'use strict';

/* global structuredClone */

const { groupTasksForSections } = require('../../renderer/sidebar-task-groups');
const options = { pendingDeleteId: null, favoriteIds: new Set(['fav']), jiraFilter: '' };

describe('groupTasksForSections', () => {
  it.each([[], null, undefined])('returns empty groups for %s', (tasks) => {
    expect(groupTasksForSections(tasks, options)).toEqual({
      visibleTasks: [],
      gcal: [],
      outlook: [],
      jira: [],
      local: [],
      gtasks: [],
      favorites: [],
      isEmpty: true,
    });
  });

  it('groups every source and removes pending deletion from every group without mutation', () => {
    const tasks = ['gcal', 'outlook', 'jira', 'local', 'gtasks'].map((source) => ({
      id: source,
      source,
      title: source,
    }));
    tasks.push({ id: 'fav', source: 'jira', title: 'Favorite' });
    const copy = structuredClone(tasks);
    const result = groupTasksForSections(tasks, { ...options, pendingDeleteId: 'fav' });
    expect(result.visibleTasks).toEqual(copy.slice(0, 5));
    for (const source of ['gcal', 'outlook', 'jira', 'local', 'gtasks']) {
      expect(result[source]).toEqual([copy.find((task) => task.source === source)]);
    }
    expect(result.favorites).toEqual([]);
    expect(tasks).toEqual(copy);
  });

  it('puts a Jira favorite only in favorites and leaves other sources independent of favorites', () => {
    const favorite = { id: 'fav', source: 'jira', title: 'Favorite' };
    const local = { id: 'local', source: 'local', title: 'Local' };
    const result = groupTasksForSections([favorite, local], { ...options, jiraFilter: 'missing' });
    expect(result.favorites).toEqual([favorite]);
    expect(result.jira).toEqual([]);
    expect(result.local).toEqual([local]);
    expect(result.isEmpty).toBe(false);
  });

  it('sorts both calendars by deadline with null as zero without changing the input', () => {
    const tasks = ['gcal', 'outlook'].flatMap((source) => [
      { id: `${source}-late`, source, due_at: 10 },
      { id: `${source}-null`, source, due_at: null },
      { id: `${source}-early`, source, due_at: -1 },
    ]);
    const copy = structuredClone(tasks);
    const result = groupTasksForSections(tasks, options);
    for (const source of ['gcal', 'outlook']) {
      expect(result[source].map((task) => task.due_at)).toEqual([-1, null, 10]);
    }
    expect(tasks).toEqual(copy);
  });

  it('filters case-insensitively with long unicode input while preserving source order', () => {
    const title = 'È東京'.repeat(2000);
    const tasks = [
      { id: '1', source: 'jira', title },
      { id: '2', source: 'jira', title: '' },
    ];
    expect(
      groupTasksForSections(tasks, { ...options, jiraFilter: title.toLowerCase() }).jira,
    ).toEqual([tasks[0]]);
    expect(groupTasksForSections(tasks, options).jira).toEqual(tasks);
    expect(
      groupTasksForSections(tasks, { ...options, pendingDeleteId: '1', jiraFilter: title }).jira,
    ).toEqual([]);
  });

  it('is empty when its sole task is pending deletion', () => {
    const result = groupTasksForSections([{ id: 'gone', source: 'local' }], {
      ...options,
      pendingDeleteId: 'gone',
    });
    expect(result.visibleTasks).toEqual([]);
    expect(result.isEmpty).toBe(true);
  });
});

'use strict';

function filterJiraTasks(tasks, jiraFilter) {
  if (!jiraFilter) {
    return tasks;
  }
  const query = jiraFilter.toLowerCase();
  return tasks.filter((task) => task.title.toLowerCase().includes(query));
}

function groupTasksForSections(tasks, { pendingDeleteId, favoriteIds, jiraFilter }) {
  const visibleTasks = (tasks || []).filter((task) => task.id !== pendingDeleteId);
  const bySource = (source) => visibleTasks.filter((task) => task.source === source);
  const byDeadline = (a, b) => (a.due_at || 0) - (b.due_at || 0);
  const jira = bySource('jira');
  return {
    visibleTasks,
    isEmpty: visibleTasks.length === 0,
    gcal: bySource('gcal').sort(byDeadline),
    outlook: bySource('outlook').sort(byDeadline),
    jira: filterJiraTasks(
      jira.filter((task) => !favoriteIds.has(task.id)),
      jiraFilter,
    ),
    local: bySource('local'),
    gtasks: bySource('gtasks'),
    favorites: jira.filter((task) => favoriteIds.has(task.id)),
  };
}

if (typeof module !== 'undefined') {
  module.exports = { groupTasksForSections };
}

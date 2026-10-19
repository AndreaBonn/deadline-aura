'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

it('loads pure sidebar scripts in page order without CommonJS and exposes working globals', () => {
  const renderer = path.resolve(__dirname, '../../renderer');
  const html = readFileSync(path.join(renderer, 'index.html'), 'utf8');
  const pureScripts = new Set([
    'sidebar-utils.js',
    'sidebar-score-breakdown.js',
    'sidebar-task-groups.js',
    'sidebar-timer.js',
    'sidebar-task-card.js',
    'sidebar-form-values.js',
    'sidebar-ai-panel.js',
  ]);
  const context = vm.createContext({ t: (key) => key });
  for (const [, file] of html.matchAll(/<script src="([^"]+)"/g)) {
    if (pureScripts.has(file)) {
      const filename = path.join(renderer, file);
      vm.runInContext(readFileSync(filename, 'utf8'), context, { filename });
    }
  }
  expect(context.buildScoreBreakdownHtml(null, context.t)).toBe(
    '<div class="breakdown-empty">score_breakdown.unavailable</div>',
  );
  expect(
    context.buildBreakdownSection('title', '<p>Body</p>', () => '<img src=x onerror=1>'),
  ).toContain('&lt;img src=x onerror=1&gt;');
  expect(
    context.groupTasksForSections([], {
      pendingDeleteId: null,
      favoriteIds: new Set(),
      jiraFilter: '',
    }).isEmpty,
  ).toBe(true);
  expect(context.parseStoredTimer('{broken')).toBeNull();
  expect(
    context
      .taskMenuModel({ source: 'jira' }, { isPinned: true, googleCalendarReady: false })
      .map((item) => item.id),
  ).toEqual(['unpin', 'connect-google']);
  expect(context.readTaskFormValues({ title: ' Task ', date: '', priority: '2' })).toEqual({
    title: 'Task',
    dueAt: null,
    priority: 2,
  });
  expect(context.toDateTimeLocalValue(new Date(2026, 9, 20))).toBe('2026-10-20T00:00');
  expect(context.defaultLogStart(new Date(2026, 9, 20, 10, 59))).toBe('2026-10-20T10:45');
  expect(context.validateTimeLog({ duration: '0' }).error).toBe('sidebar.error_duration');
  expect(context.isFlybySuppressed({ enabled: true, snoozed_until: 101 }, 100)).toBe(true);
  expect(context.stressToColor(12)).toBe('hsl(0, 60%, 45%)');
  expect(
    context.buildForecastColumns([{ date: '2026-10-19', stress: 5 }], {
      todayKey: '2026-10-19',
      locale: 'en-US',
    }),
  ).toEqual([
    {
      label: 'Mon',
      value: '50%',
      color: 'hsl(80, 48%, 38%)',
      isToday: true,
    },
  ]);
  const timer = context.createTimerState(
    { id: 'task' },
    {
      startTime: '2026-10-19T09:00:00.000Z',
      calendarId: 'work',
      summary: 'Résumé 東京',
    },
  );
  expect(timer).toEqual({
    taskId: 'task',
    startTime: '2026-10-19T09:00:00.000Z',
    calendarId: 'work',
    summary: 'Résumé 東京',
    eventId: null,
  });
});

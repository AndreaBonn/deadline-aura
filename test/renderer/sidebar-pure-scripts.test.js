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
  ]);
  const context = vm.createContext({ t: (key) => key });
  for (const [, file] of html.matchAll(/<script src="([^"]+)"/g)) {
    if (pureScripts.has(file)) {
      vm.runInContext(readFileSync(path.join(renderer, file), 'utf8'), context);
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

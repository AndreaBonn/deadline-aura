'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'deadlineaura-persist-'));
vi.spyOn(os, 'homedir').mockReturnValue(home);
const db = require('../../store/db');
const gcal = require('../../integrations/google-calendar');
const gtasks = require('../../integrations/google-tasks');
const jira = require('../../integrations/jira');
const outlook = require('../../integrations/outlook');
const aiScorer = require('../../ai/ai-scorer');
const { sync } = require('../../core/sync-daemon');

const config = {
  sources: { google_calendar: { enabled: false }, jira: { enabled: false } },
  ai: { enabled: false },
};
const task = (id, source) => ({
  id,
  source,
  title: id,
  due_at: Date.now() + 3600000,
  priority: 3,
  is_done: 0,
  raw_json: '{}',
  synced_at: Date.now(),
});
const row = (id) => db.getDb().prepare('SELECT is_stale FROM tasks WHERE id = ?').get(id);

beforeEach(() => {
  db.getDb().prepare('DELETE FROM tasks').run();
  vi.spyOn(gcal, 'fetchEvents').mockResolvedValue([]);
  vi.spyOn(gtasks, 'fetchTasks').mockResolvedValue([]);
  vi.spyOn(jira, 'fetchIssues').mockResolvedValue([]);
  vi.spyOn(outlook, 'fetchEvents').mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  db.close();
  fs.rmSync(home, { recursive: true, force: true });
});

it('disabled calendar preserves old events when empty and saves returned events', async () => {
  db.upsertTask(task('gcal_old', 'gcal'));
  await sync(config);
  expect(row('gcal_old').is_stale).toBe(0);
  gcal.fetchEvents.mockResolvedValue([task('gcal_new', 'gcal')]);
  expect((await sync(config)).gcal).toBe(1);
  expect(row('gcal_new').is_stale).toBe(0);
  expect(row('gcal_old').is_stale).toBe(1);
});

it('Google Tasks persistence follows the calendar setting', async () => {
  gtasks.fetchTasks.mockResolvedValue([task('gtasks_new', 'gtasks')]);
  expect((await sync(config)).gtasks).toBe(0);
  expect(row('gtasks_new')).toBeUndefined();
  const enabled = { ...config, sources: { ...config.sources, google_calendar: { enabled: true } } };
  expect((await sync(enabled)).gtasks).toBe(1);
  expect(row('gtasks_new').is_stale).toBe(0);
});

it('missing Outlook configuration preserves old events when empty and saves returned events', async () => {
  db.upsertTask(task('outlook_old', 'outlook'));
  await sync(config);
  expect(row('outlook_old').is_stale).toBe(0);
  outlook.fetchEvents.mockResolvedValue([task('outlook_new', 'outlook')]);
  expect((await sync(config)).outlook).toBe(1);
  expect(row('outlook_new').is_stale).toBe(0);
  expect(row('outlook_old').is_stale).toBe(1);
});

it('partial Jira results update returned issues without marking missing issues stale', async () => {
  db.upsertTask(task('jira_old', 'jira'));
  const error = new Error('site unavailable');
  error.partialIssues = [task('jira_new', 'jira')];
  jira.fetchIssues.mockRejectedValue(error);
  const result = await sync(config);
  expect(result.jira).toBe(1);
  expect(result.errors).toEqual([{ source: 'jira', message: 'site unavailable' }]);
  expect(row('jira_old').is_stale).toBe(0);
  expect(row('jira_new').is_stale).toBe(0);
});

it('sends the issues of the healthy Jira sites to AI scoring when another site failed', async () => {
  const error = new Error('site unavailable');
  error.partialIssues = [task('jira_partial', 'jira')];
  jira.fetchIssues.mockRejectedValue(error);
  const scoreSpy = vi.spyOn(aiScorer, 'scoreTasks').mockResolvedValue(null);

  await sync({ ...config, ai: { enabled: true, recalc_hours: 6 }, sync: { lookahead_hours: 72 } });

  expect(scoreSpy).toHaveBeenCalledTimes(1);
  expect(scoreSpy.mock.calls[0][0].map((t) => t.id)).toContain('jira_partial');
});

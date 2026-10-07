'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

vi.spyOn(os, 'homedir').mockReturnValue(
  path.join(os.tmpdir(), 'deadlineaura-sync-int-home-' + process.pid),
);

const db = require('../../store/db');
const gcal = require('../../integrations/google-calendar');
const gtasks = require('../../integrations/google-tasks');
const jira = require('../../integrations/jira');
const outlook = require('../../integrations/outlook');
const aiScorer = require('../../ai/ai-scorer');
const { sync, computeEventsHash } = require('../../core/sync-daemon');

const BASE_CONFIG = {
  sources: {
    google_calendar: { enabled: true },
    jira: { enabled: false },
  },
  ai: { enabled: false, recalc_hours: 6 },
  sync: { lookahead_hours: 72 },
};

afterAll(() => {
  db.close();
  const dataDir = path.join(
    os.tmpdir(),
    'deadlineaura-sync-int-home-' + process.pid,
    '.local',
    'share',
    'deadlineaura',
  );
  if (fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

beforeEach(() => {
  vi.restoreAllMocks();
  // Google Tasks is an always-on source: isolate it so the real integration
  // (and the on-disk .env credentials) never runs during these tests.
  vi.spyOn(gtasks, 'fetchTasks').mockResolvedValue([]);
  db.getDb().prepare('DELETE FROM tasks').run();
  db.getDb().prepare('DELETE FROM ai_cache').run();
  db.getDb().prepare('DELETE FROM scores').run();
});

describe('sync-daemon — sync()', () => {
  it('returns zero counts and empty errors when both sources return empty', async () => {
    vi.spyOn(gcal, 'fetchEvents').mockResolvedValue([]);
    vi.spyOn(jira, 'fetchIssues').mockResolvedValue([]);

    const result = await sync(BASE_CONFIG);

    expect(result.gcal).toBe(0);
    expect(result.jira).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('upserts gcal events and returns correct count', async () => {
    const events = [
      {
        id: 'gcal_e1',
        source: 'gcal',
        title: 'Event',
        due_at: Date.now() + 3600000,
        start_at: null,
        priority: 3,
        is_done: 0,
        web_url: null,
        raw_json: '{}',
        synced_at: Date.now(),
      },
    ];
    vi.spyOn(gcal, 'fetchEvents').mockResolvedValue(events);
    vi.spyOn(jira, 'fetchIssues').mockResolvedValue([]);

    const result = await sync(BASE_CONFIG);

    expect(result.gcal).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('upserts jira issues and returns correct count', async () => {
    const issues = [
      {
        id: 'jira_APP-42',
        source: 'jira',
        title: 'Ship calendar integration',
        due_at: Date.parse('2026-10-08T09:00:00Z'),
        start_at: null,
        priority: 3,
        is_done: 0,
        web_url: 'https://example.atlassian.net/browse/APP-42',
        raw_json: '{}',
        synced_at: Date.parse('2026-10-07T09:00:00Z'),
      },
    ];
    vi.spyOn(gcal, 'fetchEvents').mockResolvedValue([]);
    vi.spyOn(jira, 'fetchIssues').mockResolvedValue(issues);
    vi.spyOn(outlook, 'fetchEvents').mockResolvedValue([]);

    const result = await sync({
      ...BASE_CONFIG,
      sources: { ...BASE_CONFIG.sources, jira: { enabled: true } },
    });

    const stored = db.getDb().prepare('SELECT * FROM tasks WHERE source = ?').all('jira');
    expect({ count: result.jira, errors: result.errors, stored }).toEqual({
      count: 1,
      errors: [],
      stored: [expect.objectContaining(issues[0])],
    });
  });

  it('upserts outlook events and counts them separately', async () => {
    const start = Date.now() + 3600000;
    vi.spyOn(gcal, 'fetchEvents').mockResolvedValue([]);
    vi.spyOn(jira, 'fetchIssues').mockResolvedValue([]);
    vi.spyOn(outlook, 'fetchEvents').mockResolvedValue([
      {
        id: 'outlook_abc_1',
        source: 'outlook',
        title: 'Standup',
        due_at: start + 1800000,
        start_at: start,
        priority: 3,
        is_done: 0,
        web_url: null,
        meet_url: null,
        raw_json: '{}',
        synced_at: Date.now(),
      },
    ]);

    const result = await sync({
      ...BASE_CONFIG,
      sources: { ...BASE_CONFIG.sources, outlook: { enabled: true } },
    });

    expect(result.outlook).toBe(1);
    expect(result.gcal).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('captures an outlook error without touching the other sources', async () => {
    vi.spyOn(gcal, 'fetchEvents').mockResolvedValue([]);
    vi.spyOn(jira, 'fetchIssues').mockResolvedValue([]);
    vi.spyOn(outlook, 'fetchEvents').mockRejectedValue(new Error('feed unreachable'));

    const result = await sync({
      ...BASE_CONFIG,
      sources: { ...BASE_CONFIG.sources, outlook: { enabled: true } },
    });

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].source).toBe('outlook');
    expect(result.errors[0].message).toContain('feed unreachable');
  });

  it('leaves stored outlook events alone when the feed fails', async () => {
    const start = Date.now() + 3600000;
    const stored = {
      id: 'outlook_kept_1',
      source: 'outlook',
      title: 'Riunione salvata',
      due_at: start + 1800000,
      start_at: start,
      priority: 3,
      is_done: 0,
      web_url: null,
      meet_url: null,
      raw_json: '{}',
      synced_at: Date.now(),
    };
    db.upsertTask(stored);

    vi.spyOn(gcal, 'fetchEvents').mockResolvedValue([]);
    vi.spyOn(jira, 'fetchIssues').mockResolvedValue([]);
    vi.spyOn(outlook, 'fetchEvents').mockRejectedValue(new Error('feed unreachable'));

    await sync({
      ...BASE_CONFIG,
      sources: { ...BASE_CONFIG.sources, outlook: { enabled: true } },
    });

    const row = db.getDb().prepare("SELECT * FROM tasks WHERE id = 'outlook_kept_1'").get();
    expect(row.is_stale).toBe(0);
  });

  it('captures gcal error in errors array without throwing', async () => {
    vi.spyOn(gcal, 'fetchEvents').mockRejectedValue(new Error('network timeout'));
    vi.spyOn(jira, 'fetchIssues').mockResolvedValue([]);

    const result = await sync(BASE_CONFIG);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].source).toBe('google_calendar');
    expect(result.errors[0].message).toContain('network timeout');
  });

  it('captures jira error in errors array without throwing', async () => {
    vi.spyOn(gcal, 'fetchEvents').mockResolvedValue([]);
    vi.spyOn(jira, 'fetchIssues').mockRejectedValue(new Error('jira unreachable'));

    const configWithJira = {
      ...BASE_CONFIG,
      sources: { ...BASE_CONFIG.sources, jira: { enabled: true } },
    };
    const result = await sync(configWithJira);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].source).toBe('jira');
  });

  it('captures both errors when both sources fail', async () => {
    vi.spyOn(gcal, 'fetchEvents').mockRejectedValue(new Error('gcal down'));
    vi.spyOn(jira, 'fetchIssues').mockRejectedValue(new Error('jira down'));

    const configWithBoth = {
      ...BASE_CONFIG,
      sources: {
        google_calendar: { enabled: true },
        jira: { enabled: true },
      },
    };
    const result = await sync(configWithBoth);

    expect(result.errors).toHaveLength(2);
  });

  it('skips AI scoring when ai.enabled is false', async () => {
    vi.spyOn(gcal, 'fetchEvents').mockResolvedValue([]);
    vi.spyOn(jira, 'fetchIssues').mockResolvedValue([]);
    const scoreSpy = vi.spyOn(aiScorer, 'scoreTasks');

    await sync({ ...BASE_CONFIG, ai: { enabled: false } });

    expect(scoreSpy).not.toHaveBeenCalled();
  });

  it('skips AI scoring when no tasks returned', async () => {
    vi.spyOn(gcal, 'fetchEvents').mockResolvedValue([]);
    vi.spyOn(jira, 'fetchIssues').mockResolvedValue([]);
    const scoreSpy = vi.spyOn(aiScorer, 'scoreTasks');

    await sync({ ...BASE_CONFIG, ai: { enabled: true, recalc_hours: 6 } });

    expect(scoreSpy).not.toHaveBeenCalled();
  });

  it('invokes AI scoring when ai.enabled and tasks exist', async () => {
    const events = [
      {
        id: 'gcal_e2',
        source: 'gcal',
        title: 'AI Task',
        due_at: Date.now() + 3600000,
        start_at: null,
        priority: 2,
        is_done: 0,
        web_url: null,
        raw_json: '{}',
        synced_at: Date.now(),
      },
    ];
    vi.spyOn(gcal, 'fetchEvents').mockResolvedValue(events);
    vi.spyOn(jira, 'fetchIssues').mockResolvedValue([]);
    const scoreSpy = vi.spyOn(aiScorer, 'scoreTasks').mockResolvedValue(null);

    const configWithAi = {
      ...BASE_CONFIG,
      ai: { enabled: true, recalc_hours: 6 },
      sync: { lookahead_hours: 72 },
    };
    await sync(configWithAi);

    expect(scoreSpy).toHaveBeenCalled();
  });

  it('uses cached AI result when hash matches and no recalc needed', async () => {
    const event = {
      id: 'gcal_cached',
      source: 'gcal',
      title: 'Cached Task',
      due_at: Date.now() + 3600000,
      start_at: null,
      priority: 3,
      is_done: 0,
      web_url: null,
      raw_json: '{}',
      synced_at: Date.now(),
    };

    db.upsertTask(event);

    const hash = computeEventsHash([event]);
    const cachedResponse = JSON.stringify({ per_event: [], global_stress: 5 });
    db.setAiCache(hash, cachedResponse);
    db.saveGlobalScore(0.5);

    vi.spyOn(gcal, 'fetchEvents').mockResolvedValue([event]);
    vi.spyOn(jira, 'fetchIssues').mockResolvedValue([]);
    const scoreSpy = vi.spyOn(aiScorer, 'scoreTasks').mockResolvedValue(null);

    const configWithAi = {
      ...BASE_CONFIG,
      ai: { enabled: true, recalc_hours: 6 },
      sync: { lookahead_hours: 72 },
    };
    await sync(configWithAi);

    expect(scoreSpy).not.toHaveBeenCalled();
  });

  it('captures AI error in errors array without throwing', async () => {
    const event = {
      id: 'gcal_aierr',
      source: 'gcal',
      title: 'AI Error Task',
      due_at: Date.now() + 3600000,
      start_at: null,
      priority: 3,
      is_done: 0,
      web_url: null,
      raw_json: '{}',
      synced_at: Date.now(),
    };
    vi.spyOn(gcal, 'fetchEvents').mockResolvedValue([event]);
    vi.spyOn(jira, 'fetchIssues').mockResolvedValue([]);
    vi.spyOn(aiScorer, 'scoreTasks').mockRejectedValue(new Error('AI provider error'));

    const configWithAi = {
      ...BASE_CONFIG,
      ai: { enabled: true, recalc_hours: 6 },
      sync: { lookahead_hours: 72 },
    };
    const result = await sync(configWithAi);

    expect(result.errors.some((e) => e.source === 'ai')).toBe(true);
  });

  it('does not mark existing gcal tasks stale when fetchEvents throws', async () => {
    const event = {
      id: 'gcal_keep',
      source: 'gcal',
      title: 'Keep Me',
      due_at: Date.now() + 3600000,
      start_at: null,
      priority: 3,
      is_done: 0,
      is_stale: 0,
      web_url: null,
      raw_json: '{}',
      synced_at: Date.now(),
    };
    db.upsertTask(event);

    vi.spyOn(gcal, 'fetchEvents').mockRejectedValue(new Error('invalid_grant'));
    vi.spyOn(jira, 'fetchIssues').mockResolvedValue([]);

    const result = await sync(BASE_CONFIG);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].source).toBe('google_calendar');

    const task = db.getDb().prepare('SELECT is_stale FROM tasks WHERE id = ?').get('gcal_keep');
    expect(task.is_stale).toBe(0);
  });
});

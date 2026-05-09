'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');

vi.spyOn(os, 'homedir').mockReturnValue(
  path.join(os.tmpdir(), 'deadlineaura-sync-score-' + process.pid),
);

const db = require('../../store/db');
const gcal = require('../../integrations/google-calendar');
const jira = require('../../integrations/jira');
const aiScorer = require('../../ai/ai-scorer');
const { sync } = require('../../core/sync-daemon');

const BASE_CONFIG = {
  sources: {
    google_calendar: { enabled: true },
    jira: { enabled: false },
  },
  ai: { enabled: true, recalc_hours: 6 },
  sync: { lookahead_hours: 72 },
};

afterAll(() => {
  db.close();
  const dataDir = path.join(
    os.tmpdir(),
    'deadlineaura-sync-score-' + process.pid,
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
  db.getDb().prepare('DELETE FROM tasks').run();
  db.getDb().prepare('DELETE FROM ai_cache').run();
  db.getDb().prepare('DELETE FROM scores').run();
});

describe('sync-daemon — AI scoring success path', () => {
  it('stores AI result in cache and applies scores when scoring succeeds', async () => {
    const event = {
      id: 'gcal_score_ok',
      source: 'gcal',
      title: 'Scorable Task',
      due_at: Date.now() + 3600000,
      start_at: null,
      priority: 2,
      is_done: 0,
      web_url: null,
      raw_json: '{}',
      synced_at: Date.now(),
    };

    vi.spyOn(gcal, 'fetchEvents').mockResolvedValue([event]);
    vi.spyOn(jira, 'fetchIssues').mockResolvedValue([]);

    const aiResult = {
      global_stress: 7,
      per_event: [
        {
          id: 1,
          stress: 7,
          category: 'work-critical',
          reasoning: 'Tight deadline',
          cognitive_type: 'analytical',
        },
      ],
    };
    vi.spyOn(aiScorer, 'scoreTasks').mockResolvedValue(aiResult);

    const result = await sync(BASE_CONFIG);

    expect(result.errors).toHaveLength(0);
    expect(result.gcal).toBe(1);

    // Verify AI scores were applied to task
    const row = db.getDb().prepare('SELECT * FROM tasks WHERE id = ?').get('gcal_score_ok');
    expect(row.ai_stress).toBe(7);
    expect(row.ai_category).toBe('work-critical');
    expect(row.ai_reasoning).toBe('Tight deadline');
    expect(row.ai_cognitive_type).toBe('analytical');

    // Verify global score was saved
    const score = db.getLastGlobalScore();
    expect(score.global_score).toBeCloseTo(0.7, 2);

    // Verify AI cache was populated
    const cacheEntries = db.getDb().prepare('SELECT * FROM ai_cache').all();
    expect(cacheEntries.length).toBeGreaterThan(0);
  });

  it('recalculates when cache exists but recalc_hours elapsed', async () => {
    const event = {
      id: 'gcal_recalc',
      source: 'gcal',
      title: 'Recalc Task',
      due_at: Date.now() + 3600000,
      start_at: null,
      priority: 3,
      is_done: 0,
      web_url: null,
      raw_json: '{}',
      synced_at: Date.now(),
    };

    // Insert task and old cache entry
    db.upsertTask(event);
    const oldTime = Date.now() - 7 * 3600000; // 7 hours ago (exceeds 6h recalc)
    db.getDb()
      .prepare('INSERT INTO ai_cache (events_hash, response_json, computed_at) VALUES (?, ?, ?)')
      .run('old_hash', '{"global_stress": 3, "per_event": []}', oldTime);

    vi.spyOn(gcal, 'fetchEvents').mockResolvedValue([event]);
    vi.spyOn(jira, 'fetchIssues').mockResolvedValue([]);

    const newAiResult = {
      global_stress: 5,
      per_event: [
        { id: 1, stress: 5, category: 'work-routine', reasoning: 'Normal', cognitive_type: 'administrative' },
      ],
    };
    const scoreSpy = vi.spyOn(aiScorer, 'scoreTasks').mockResolvedValue(newAiResult);

    await sync(BASE_CONFIG);

    // AI scorer should have been called (not using cache)
    expect(scoreSpy).toHaveBeenCalled();

    // New score should be saved
    const score = db.getLastGlobalScore();
    expect(score.global_score).toBeCloseTo(0.5, 2);
  });
});

describe('sync-daemon — markStale during sync', () => {
  it('marks previously synced tasks as stale when they disappear from source', async () => {
    // Insert a task that was previously synced
    db.upsertTask({
      id: 'gcal_old',
      source: 'gcal',
      title: 'Old Event',
      due_at: Date.now() + 3600000,
      priority: 3,
      is_done: 0,
      web_url: null,
      raw_json: '{}',
      synced_at: Date.now(),
    });

    // New sync returns different events
    const newEvent = {
      id: 'gcal_new',
      source: 'gcal',
      title: 'New Event',
      due_at: Date.now() + 3600000,
      start_at: null,
      priority: 3,
      is_done: 0,
      web_url: null,
      raw_json: '{}',
      synced_at: Date.now(),
    };

    vi.spyOn(gcal, 'fetchEvents').mockResolvedValue([newEvent]);
    vi.spyOn(jira, 'fetchIssues').mockResolvedValue([]);

    const config = { ...BASE_CONFIG, ai: { enabled: false } };
    await sync(config);

    const oldTask = db.getDb().prepare('SELECT is_stale FROM tasks WHERE id = ?').get('gcal_old');
    expect(oldTask.is_stale).toBe(1);

    const newTask = db.getDb().prepare('SELECT is_stale FROM tasks WHERE id = ?').get('gcal_new');
    expect(newTask.is_stale).toBe(0);
  });
});

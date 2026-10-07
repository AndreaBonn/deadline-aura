'use strict';

const { createCanvas } = require('canvas');
const { filterUpcomingEvents, drawDailyAgenda } = require('../../core/wallpaper-agenda');

const HOUR_MS = 3600 * 1000;
const REGION = { x: 0, y: 0, width: 1280, height: 720 };

function event(title, offsetMs, field = 'start_at') {
  return { title, source: 'gcal', [field]: Date.now() + offsetMs };
}

function drawnTexts(allTasks, agendaBottom = REGION.height) {
  const ctx = createCanvas(REGION.width, REGION.height).getContext('2d');
  const texts = [];
  const original = ctx.fillText.bind(ctx);
  ctx.fillText = (text, x, y) => {
    texts.push(String(text));
    original(text, x, y);
  };
  drawDailyAgenda(ctx, allTasks, REGION, agendaBottom);
  return texts;
}

describe('wallpaper-agenda — filterUpcomingEvents', () => {
  it('sorts due-only events alongside events with start times', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T12:00:00Z'));
    try {
      const later = event('Later deadline', 3 * HOUR_MS, 'due_at');
      const sooner = event('Earlier deadline', HOUR_MS, 'due_at');
      const meeting = event('Meeting', 2 * HOUR_MS);

      const result = filterUpcomingEvents([later, meeting, sooner]);

      expect(result).toEqual([sooner, meeting, later]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps only events in the next 24 hours, sorted by time', () => {
    const later = event('later', 5 * HOUR_MS);
    const sooner = event('sooner', 1 * HOUR_MS, 'due_at');
    const past = event('past', -1 * HOUR_MS);
    const tooFar = event('too far', 25 * HOUR_MS);
    const undated = { title: 'undated', source: 'gcal' };

    const result = filterUpcomingEvents([later, past, tooFar, undated, sooner]);

    expect(result.map((e) => e.title)).toEqual(['sooner', 'later']);
  });
});

describe('wallpaper-agenda — drawDailyAgenda', () => {
  it('draws the JIRA fallback badge for an unknown event source', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T12:00:00Z'));
    try {
      const unknown = { ...event('External review', HOUR_MS), source: 'external' };

      const texts = drawnTexts([unknown]);

      expect(texts.slice(-2)).toEqual(['JIRA', 'External review']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('draws the header and every upcoming event title', () => {
    const texts = drawnTexts([event('Standup', HOUR_MS), event('Review', 2 * HOUR_MS)]);

    expect(texts).toContain('Standup');
    expect(texts).toContain('Review');
    expect(texts.length).toBeGreaterThan(2);
  });

  it('draws nothing when no event falls in the next 24 hours', () => {
    const drawnWithEvent = drawnTexts([event('Standup', HOUR_MS)]);
    const drawnWithoutEvent = drawnTexts([event('Old', -HOUR_MS)]);

    expect(drawnWithEvent.length).toBeGreaterThan(0);
    expect(drawnWithoutEvent).toEqual([]);
  });

  it('stops above the usage band and summarises the overflow', () => {
    const many = Array.from({ length: 30 }, (_, i) => event(`E${i}`, (i + 1) * 0.5 * HOUR_MS));

    const texts = drawnTexts(many, 200);

    expect(texts).not.toContain('E29');
    expect(texts.some((text) => /\+\s*\d+/.test(text))).toBe(true);
  });
});

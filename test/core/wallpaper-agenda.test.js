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

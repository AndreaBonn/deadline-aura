'use strict';

const { createCanvas } = require('canvas');
const {
  filterUpcomingEvents,
  drawDailyAgenda,
  agendaBadge,
  formatAgendaTime,
} = require('../../core/wallpaper-agenda');
const { setLanguage, getLanguage } = require('../../i18n');

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

  it.each([
    ['it', 'PERSONALE'],
    ['en', 'PERSONAL'],
  ])('labels a personal (local) task with its own badge in %s', (language, badge) => {
    const previous = getLanguage();
    setLanguage(language);
    try {
      const personal = { ...event('Pay rent', HOUR_MS), source: 'local' };

      const texts = drawnTexts([personal]);

      expect(texts.slice(-2)).toEqual([badge, 'Pay rent']);
    } finally {
      setLanguage(previous);
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

describe('wallpaper-agenda — agendaBadge', () => {
  it.each([
    ['gcal', 'CAL', 'rgba(66, 133, 244, 0.5)'],
    ['gtasks', 'TASKS', 'rgba(52, 168, 83, 0.5)'],
    ['jira', 'JIRA', 'rgba(255, 152, 0, 0.5)'],
    ['outlook', 'OUTLOOK', 'rgba(0, 120, 212, 0.5)'],
    ['local', 'PERSONALE', 'rgba(171, 71, 188, 0.5)'],
    ['external', 'JIRA', 'rgba(255, 152, 0, 0.5)'],
  ])('labels source %s as %s', (source, label, color) => {
    const previous = getLanguage();
    setLanguage('it');
    try {
      expect(agendaBadge(source)).toEqual({ label, color });
    } finally {
      setLanguage(previous);
    }
  });
});

describe('wallpaper-agenda — formatAgendaTime', () => {
  it.each([
    [new Date(2026, 4, 11, 9, 5).getTime(), '09:05'],
    [new Date(2026, 4, 11, 0, 0).getTime(), '00:00'],
    [new Date(2026, 4, 11, 23, 59).getTime(), '23:59'],
  ])('formats %s as local HH:MM', (timestamp, expected) => {
    expect(formatAgendaTime(timestamp)).toBe(expected);
  });
});

describe('wallpaper-agenda — drawn row time', () => {
  it('draws the start time, falling back to the due time', () => {
    const start = new Date();
    start.setHours(start.getHours() + 1, 7, 0, 0);
    const due = new Date();
    due.setHours(due.getHours() + 2, 41, 0, 0);
    const meeting = {
      title: 'Sync',
      source: 'gcal',
      start_at: start.getTime(),
      due_at: due.getTime() + 3600000,
    };
    const deadline = { title: 'Report', source: 'jira', due_at: due.getTime() };
    const pad = (n) => String(n).padStart(2, '0');

    const texts = drawnTexts([meeting, deadline]);

    expect(texts).toContain(`${pad(start.getHours())}:07`);
    expect(texts).toContain(`${pad(due.getHours())}:41`);
  });
});

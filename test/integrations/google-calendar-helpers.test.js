'use strict';

const {
  normalizeEvent,
  assignPriority,
  extractMeetUrl,
} = require('../../integrations/google-calendar');

describe('google-calendar — assignPriority', () => {
  it('returns 1 for red color events (colorId = 11)', () => {
    expect(assignPriority({ colorId: '11', summary: 'anything' })).toBe(1);
  });

  it('returns 2 when title contains priority keyword', () => {
    expect(assignPriority({ summary: 'Release v2.0' })).toBe(2);
    expect(assignPriority({ summary: 'Deploy to staging' })).toBe(2);
  });

  it('returns 2 when description contains priority keyword', () => {
    expect(assignPriority({ summary: 'Meeting', description: 'urgent review needed' })).toBe(2);
    expect(assignPriority({ summary: 'Meeting', description: 'Discuss deadline for Q3' })).toBe(2);
  });

  it('returns 3 for normal events', () => {
    expect(assignPriority({ summary: 'Lunch', description: 'casual' })).toBe(3);
  });

  it('handles missing summary and description', () => {
    expect(assignPriority({})).toBe(3);
  });

  it('uses custom keyword list when provided', () => {
    expect(assignPriority({ summary: 'custom-flag meeting' }, ['custom-flag'])).toBe(2);
    expect(assignPriority({ summary: 'Team standup' }, ['custom-flag'])).toBe(3);
  });

  it('is case-insensitive', () => {
    expect(assignPriority({ summary: 'URGENT: fix prod' })).toBe(2);
  });
});

describe('google-calendar — extractMeetUrl', () => {
  it('returns hangoutLink when present', () => {
    const event = { hangoutLink: 'https://meet.google.com/abc-defg-hij' };
    expect(extractMeetUrl(event)).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('returns conferenceData video entryPoint when no hangoutLink', () => {
    const event = {
      conferenceData: {
        entryPoints: [
          { entryPointType: 'phone', uri: 'tel:+1234567890' },
          { entryPointType: 'video', uri: 'https://zoom.us/j/123456' },
        ],
      },
    };
    expect(extractMeetUrl(event)).toBe('https://zoom.us/j/123456');
  });

  it('prefers hangoutLink over conferenceData', () => {
    const event = {
      hangoutLink: 'https://meet.google.com/abc',
      conferenceData: {
        entryPoints: [{ entryPointType: 'video', uri: 'https://zoom.us/j/999' }],
      },
    };
    expect(extractMeetUrl(event)).toBe('https://meet.google.com/abc');
  });

  it('returns null when no meeting link exists', () => {
    expect(extractMeetUrl({})).toBeNull();
    expect(extractMeetUrl({ conferenceData: {} })).toBeNull();
    expect(extractMeetUrl({ conferenceData: { entryPoints: [] } })).toBeNull();
  });

  it('skips entryPoints without uri', () => {
    const event = {
      conferenceData: {
        entryPoints: [{ entryPointType: 'video' }],
      },
    };
    expect(extractMeetUrl(event)).toBeNull();
  });

  it('extracts Teams link from description', () => {
    const event = {
      description:
        'Agenda: demo\nhttps://teams.microsoft.com/meet/327100924612?p=abc\nID riunione: 123',
    };
    expect(extractMeetUrl(event)).toBe('https://teams.microsoft.com/meet/327100924612?p=abc');
  });

  it('extracts Zoom link from description', () => {
    const event = {
      description: 'Join: https://us02web.zoom.us/j/123456789?pwd=abc123',
    };
    expect(extractMeetUrl(event)).toBe('https://us02web.zoom.us/j/123456789?pwd=abc123');
  });

  it('extracts Teams link from location', () => {
    const event = {
      location: 'https://teams.microsoft.com/meet/99999?p=xyz',
    };
    expect(extractMeetUrl(event)).toBe('https://teams.microsoft.com/meet/99999?p=xyz');
  });

  it('prefers description over location for fallback', () => {
    const event = {
      description: 'https://teams.microsoft.com/meet/111?p=aaa',
      location: 'https://teams.microsoft.com/meet/222?p=bbb',
    };
    expect(extractMeetUrl(event)).toBe('https://teams.microsoft.com/meet/111?p=aaa');
  });

  it('prefers hangoutLink over description fallback', () => {
    const event = {
      hangoutLink: 'https://meet.google.com/abc',
      description: 'https://teams.microsoft.com/meet/999?p=xyz',
    };
    expect(extractMeetUrl(event)).toBe('https://meet.google.com/abc');
  });

  it('returns null when description has no meeting links', () => {
    const event = {
      description: 'Regular meeting, no video link here',
      location: 'Room 42',
    };
    expect(extractMeetUrl(event)).toBeNull();
  });
});

describe('google-calendar — normalizeEvent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-05-08T12:00:00+02:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns normalized event for timed event', () => {
    const event = {
      id: 'ev1',
      summary: 'Sprint Review',
      start: { dateTime: '2030-05-08T10:00:00+02:00' },
      end: { dateTime: '2030-05-08T13:00:00+02:00' },
      htmlLink: 'https://calendar.google.com/event/ev1',
    };
    const result = normalizeEvent(event);
    expect(result.id).toBe('gcal_ev1');
    expect(result.source).toBe('gcal');
    expect(result.title).toBe('Sprint Review');
    expect(result.start_at).toBe(new Date(event.start.dateTime).getTime());
    expect(result.due_at).toBe(new Date(event.end.dateTime).getTime());
    expect(result.priority).toBe(3);
    expect(result.is_done).toBe(0);
    expect(result.all_day).toBe(false);
    expect(result.web_url).toBe('https://calendar.google.com/event/ev1');
  });

  it('returns normalized event for all-day event', () => {
    const event = {
      id: 'ev2',
      summary: 'Conference',
      start: { date: '2030-05-10' },
      end: { date: '2030-05-11' },
    };
    const result = normalizeEvent(event);
    expect(result.all_day).toBe(true);
    expect(result.start_at).toBe(new Date('2030-05-10T00:00:00').getTime());
    expect(result.due_at).toBe(new Date('2030-05-11T00:00:00').getTime());
    expect(result.web_url).toBeNull();
  });

  it('returns null for event that already ended', () => {
    const event = {
      id: 'past',
      summary: 'Past',
      start: { dateTime: '2020-01-01T10:00:00Z' },
      end: { dateTime: '2020-01-01T11:00:00Z' },
    };
    expect(normalizeEvent(event)).toBeNull();
    expect(normalizeEvent({ ...event, end: { dateTime: '2030-05-08T13:00:00Z' } })).toEqual(
      expect.objectContaining({ id: 'gcal_past' }),
    );
  });

  it('handles event without summary', () => {
    const event = {
      id: 'no-title',
      start: { dateTime: '2030-05-08T10:00:00Z' },
      end: { dateTime: '2030-05-08T11:00:00Z' },
    };
    const result = normalizeEvent(event);
    expect(result.title).toBe('(no title)');
  });

  it('handles event with missing end', () => {
    const event = {
      id: 'no-end',
      summary: 'Test',
      start: { dateTime: '2030-05-08T10:00:00Z' },
    };
    const result = normalizeEvent(event);
    expect(result).toEqual(
      expect.objectContaining({ id: 'gcal_no-end', due_at: null, all_day: false }),
    );
  });

  it('extracts meet_url from hangoutLink', () => {
    const event = {
      id: 'meet1',
      summary: 'Daily standup',
      start: { dateTime: '2030-05-08T10:00:00Z' },
      end: { dateTime: '2030-05-08T10:30:00Z' },
      hangoutLink: 'https://meet.google.com/abc-defg-hij',
    };
    const result = normalizeEvent(event);
    expect(result.meet_url).toBe('https://meet.google.com/abc-defg-hij');
  });

  it('returns null meet_url when no meeting link', () => {
    const event = {
      id: 'nomeet',
      summary: 'Lunch',
      start: { dateTime: '2030-05-08T12:00:00Z' },
      end: { dateTime: '2030-05-08T13:00:00Z' },
    };
    const result = normalizeEvent(event);
    expect(result.meet_url).toBeNull();
  });

  it('stores raw_json', () => {
    const event = {
      id: 'raw',
      summary: 'Test',
      description: 'Some details',
      start: { dateTime: '2030-05-08T10:00:00Z' },
      end: { dateTime: '2030-05-08T11:00:00Z' },
    };
    const result = normalizeEvent(event);
    const parsed = JSON.parse(result.raw_json);
    expect(parsed).toEqual(event);
  });

  it('normalizeEvent_missing_start_returns_null_start_at', () => {
    const event = { id: 'no-start', end: { dateTime: '2030-05-08T13:00:00Z' } };

    const result = normalizeEvent(event);

    expect(result).toEqual(expect.objectContaining({ id: 'gcal_no-start', start_at: null }));
  });

  it('normalizeEvent_all_day_ended_yesterday_filters_event', () => {
    const event = { id: 'past-all-day', end: { date: '2030-05-07' } };

    const result = normalizeEvent(event);
    const upcoming = normalizeEvent({ ...event, end: { date: '2030-05-09' } });

    expect(result).toBeNull();
    expect(upcoming).toEqual(expect.objectContaining({ id: 'gcal_past-all-day', all_day: true }));
  });

  it('normalizeEvent_red_event_returns_highest_priority', () => {
    const event = { id: 'red', colorId: '11', end: { dateTime: '2030-05-08T13:00:00Z' } };

    const result = normalizeEvent(event);

    expect(result).toEqual(expect.objectContaining({ id: 'gcal_red', priority: 1 }));
  });
});

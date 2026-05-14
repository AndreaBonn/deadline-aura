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
  });

  it('returns 2 when description contains priority keyword', () => {
    expect(assignPriority({ summary: 'Meeting', description: 'urgent review needed' })).toBe(2);
  });

  it('returns 3 for normal events', () => {
    expect(assignPriority({ summary: 'Lunch', description: 'casual' })).toBe(3);
  });

  it('handles missing summary and description', () => {
    expect(assignPriority({})).toBe(3);
  });

  it('uses custom keyword list when provided', () => {
    expect(assignPriority({ summary: 'custom-flag meeting' }, ['custom-flag'])).toBe(2);
  });

  it('is case-insensitive', () => {
    expect(assignPriority({ summary: 'URGENT deployment' })).toBe(2);
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
});

describe('google-calendar — normalizeEvent', () => {
  it('returns normalized event for timed event', () => {
    const event = {
      id: 'ev1',
      summary: 'Sprint Review',
      start: { dateTime: '2030-05-08T10:00:00+02:00' },
      end: { dateTime: '2030-05-08T11:00:00+02:00' },
      htmlLink: 'https://calendar.google.com/event/ev1',
    };
    const result = normalizeEvent(event);
    expect(result.id).toBe('gcal_ev1');
    expect(result.source).toBe('gcal');
    expect(result.title).toBe('Sprint Review');
    expect(result.start_at).toBeGreaterThan(0);
    expect(result.due_at).toBeGreaterThan(0);
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
    // end is undefined → endTime is null → does not filter as past
    expect(result).not.toBeNull();
    expect(result.due_at).toBeNull();
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
      start: { dateTime: '2030-05-08T10:00:00Z' },
      end: { dateTime: '2030-05-08T11:00:00Z' },
    };
    const result = normalizeEvent(event);
    const parsed = JSON.parse(result.raw_json);
    expect(parsed.id).toBe('raw');
  });
});

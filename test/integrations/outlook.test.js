const {
  fetchEvents,
  fetchFeed,
  normalizeOccurrence,
  assignPriority,
  validateFeedUrl,
} = require('../../integrations/outlook');

const MINIMAL_FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:abc@lynxspa.com',
  'SUMMARY:Punto settimanale',
  'DTSTART:20260810T080000Z',
  'DTEND:20260810T090000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function configWith(outlook) {
  return {
    sources: {
      outlook: {
        enabled: true,
        ics_url: 'https://outlook.office365.com/owa/calendar/abc/reachcalendar.ics',
        priority_keywords: ['urgent', 'deadline', 'critico'],
        ...outlook,
      },
    },
  };
}

function respondWith(body, init = {}) {
  const response = new Response(body, { status: 200, ...init });
  return vi.fn().mockResolvedValue(response);
}

describe('validateFeedUrl', () => {
  it('accepts an https url', () => {
    expect(validateFeedUrl('https://outlook.office365.com/owa/calendar/x/cal.ics')).toBe(
      'https://outlook.office365.com/owa/calendar/x/cal.ics',
    );
  });

  it('rewrites webcal to https, the scheme Outlook hands out', () => {
    expect(validateFeedUrl('webcal://outlook.office365.com/owa/calendar/x/cal.ics')).toBe(
      'https://outlook.office365.com/owa/calendar/x/cal.ics',
    );
  });

  it('rejects plain http', () => {
    expect(() => validateFeedUrl('http://outlook.office365.com/cal.ics')).toThrow(/https/i);
  });

  it('rejects loopback and private addresses', () => {
    expect(() => validateFeedUrl('https://localhost/cal.ics')).toThrow(/private|loopback/i);
    expect(() => validateFeedUrl('https://127.0.0.1/cal.ics')).toThrow(/private|loopback/i);
    expect(() => validateFeedUrl('https://192.168.1.10/cal.ics')).toThrow(/private|loopback/i);
    expect(() => validateFeedUrl('https://169.254.169.254/latest/meta-data')).toThrow(
      /private|loopback/i,
    );
  });

  it('rejects a url that is not a url at all', () => {
    expect(() => validateFeedUrl('not a url')).toThrow();
  });
});

describe('assignPriority', () => {
  const keywords = ['urgent', 'deadline', 'critico'];

  it('returns 1 for an RFC 5545 high priority', () => {
    expect(assignPriority({ priorityRaw: 1, title: 'Riunione' }, keywords)).toBe(1);
  });

  it('returns 1 for the Outlook high importance extension', () => {
    expect(assignPriority({ importanceRaw: 2, title: 'Riunione' }, keywords)).toBe(1);
  });

  it('does not treat the normal RFC priority as high', () => {
    expect(assignPriority({ priorityRaw: 5, title: 'Riunione' }, keywords)).toBe(3);
  });

  it('returns 2 on a keyword in title, description or categories', () => {
    expect(assignPriority({ title: 'URGENT: rollback' }, keywords)).toBe(2);
    expect(assignPriority({ title: 'Punto', description: 'deadline venerdi' }, keywords)).toBe(2);
    expect(assignPriority({ title: 'Punto', categories: ['Critico'] }, keywords)).toBe(2);
  });

  it('returns 3 by default', () => {
    expect(assignPriority({ title: 'Caffe' }, keywords)).toBe(3);
  });
});

describe('normalizeOccurrence', () => {
  const occurrence = {
    uid: 'abc@lynxspa.com',
    title: 'Punto settimanale',
    description: '',
    location: 'Teams',
    start: Date.parse('2026-08-10T08:00:00Z'),
    end: Date.parse('2026-08-10T09:00:00Z'),
    allDay: false,
    categories: [],
    priorityRaw: null,
    importanceRaw: null,
    joinUrl: 'https://teams.microsoft.com/l/meetup-join/abc',
  };

  it('maps onto the application record with an outlook source', () => {
    const record = normalizeOccurrence(occurrence, []);

    expect(record.source).toBe('outlook');
    expect(record.title).toBe('Punto settimanale');
    expect(record.start_at).toBe(occurrence.start);
    expect(record.due_at).toBe(occurrence.end);
    expect(record.meet_url).toBe('https://teams.microsoft.com/l/meetup-join/abc');
    expect(record.is_done).toBe(0);
  });

  it('derives an id that is stable across runs but distinct per occurrence', () => {
    const first = normalizeOccurrence({ ...occurrence, startKey: '2026-08-10T08:00:00Z' }, []);
    const same = normalizeOccurrence({ ...occurrence, startKey: '2026-08-10T08:00:00Z' }, []);
    const nextWeek = normalizeOccurrence({ ...occurrence, startKey: '2026-08-17T08:00:00Z' }, []);

    expect(first.id).toBe(same.id);
    expect(first.id).not.toBe(nextWeek.id);
    expect(first.id.startsWith('outlook_')).toBe(true);
  });

  it('keys an all-day event on the calendar date, not on a zone-dependent epoch', () => {
    const allDay = { ...occurrence, allDay: true, startKey: '2026-08-15' };

    const inRome = normalizeOccurrence(
      { ...allDay, start: Date.parse('2026-08-15T00:00+02:00') },
      [],
    );
    const inTokyo = normalizeOccurrence(
      { ...allDay, start: Date.parse('2026-08-15T00:00+09:00') },
      [],
    );

    // Same calendar day, different system zone: the row must keep its identity
    // so the AI scores attached to it survive.
    expect(inRome.id).toBe(inTokyo.id);
  });

  it('never stores the feed url in raw_json', () => {
    const record = normalizeOccurrence(occurrence, []);

    expect(record.raw_json).not.toMatch(/reachcalendar|https:\/\/outlook/);
  });
});

describe('fetchEvents', () => {
  // The fixture event is dated: pin the clock before it so the lookahead window always contains it.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-08-09T08:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns an empty list when the source is disabled', async () => {
    const fetchMock = respondWith(MINIMAL_FEED);
    vi.stubGlobal('fetch', fetchMock);

    const events = await fetchEvents(configWith({ enabled: false }));

    expect(events).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns an empty list when no url is configured', async () => {
    const fetchMock = respondWith(MINIMAL_FEED);
    vi.stubGlobal('fetch', fetchMock);

    const events = await fetchEvents(configWith({ ics_url: '' }));

    expect(events).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches the feed and returns normalized records', async () => {
    vi.stubGlobal('fetch', respondWith(MINIMAL_FEED));

    const events = await fetchEvents(configWith());

    expect(events).toHaveLength(1);
    expect(events[0].source).toBe('outlook');
    expect(events[0].title).toBe('Punto settimanale');
  });

  it('asks for calendar content and refuses to follow redirects implicitly', async () => {
    const fetchMock = respondWith(MINIMAL_FEED);
    vi.stubGlobal('fetch', fetchMock);

    await fetchEvents(configWith());

    const [, options] = fetchMock.mock.calls[0];
    expect(options.redirect).toBe('manual');
    expect(options.signal).toBeDefined();
  });

  it('follows a redirect only after revalidating the target', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('', {
          status: 302,
          headers: { location: 'https://outlook.office.com/owa/calendar/moved.ics' },
        }),
      )
      .mockResolvedValueOnce(new Response(MINIMAL_FEED, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const events = await fetchEvents(configWith());

    expect(events).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses a redirect that points at a private address', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('', {
        status: 302,
        headers: { location: 'http://169.254.169.254/latest/meta-data' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchEvents(configWith())).rejects.toThrow(/private|loopback|https/i);
  });

  it('gives up after too many redirects', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('', {
        status: 302,
        headers: { location: 'https://outlook.office365.com/owa/calendar/loop.ics' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchEvents(configWith())).rejects.toThrow(/redirect/i);
  });

  it('aborts a response larger than the cap instead of buffering it', async () => {
    vi.stubGlobal('fetch', respondWith('X'.repeat(200)));

    await expect(
      fetchFeed('https://outlook.office365.com/owa/calendar/x/cal.ics', { maxBytes: 100 }),
    ).rejects.toThrow(/too large/i);
  });

  it('surfaces an http error without putting the url in the message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', respondWith('', { status: 404, statusText: 'Not Found' }));

    const error = await fetchEvents(configWith()).catch((err) => err);

    expect(error.message).toMatch(/404/);
    expect(error.message).not.toMatch(/reachcalendar/);
  });

  it('logs the host but never the secret url when the feed fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(fetchEvents(configWith())).rejects.toThrow();

    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).toMatch(/outlook\.office365\.com/);
    expect(logged).not.toMatch(/reachcalendar/);
  });
});

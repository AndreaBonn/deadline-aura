const fs = require('fs');
const path = require('path');

const { parseIcs, TITLE_PLACEHOLDERS } = require('../../core/ics-parser');

const SAMPLE = fs.readFileSync(path.join(__dirname, '../fixtures/outlook-sample.ics'), 'utf8');

// The fixture lives in autumn 2026 so the weekly series straddles the end of
// daylight saving time in Europe/Rome (last Sunday of October).
const WINDOW = {
  windowStart: Date.parse('2026-08-01T00:00:00Z'),
  windowEnd: Date.parse('2026-12-01T00:00:00Z'),
};

function parseSample(overrides = {}) {
  return parseIcs(SAMPLE, { ...WINDOW, ...overrides });
}

function findByTitle(events, title) {
  return events.filter((e) => e.title === title);
}

describe('parseIcs', () => {
  describe('single events', () => {
    it('extracts title, times and location of a plain event', () => {
      const { events } = parseSample();

      const [review] = findByTitle(events, 'Review architettura piattaforma');
      expect(review).toBeDefined();
      expect(review.start).toBe(Date.parse('2026-08-10T09:00:00+02:00'));
      expect(review.end).toBe(Date.parse('2026-08-10T10:00:00+02:00'));
      expect(review.location).toBe('Sala Vetri');
      expect(review.allDay).toBe(false);
    });

    it('extracts the Teams join url folded across lines in the description', () => {
      const { events } = parseSample();

      const [review] = findByTitle(events, 'Review architettura piattaforma');
      expect(review.joinUrl).toBe(
        'https://teams.microsoft.com/l/meetup-join/19%3ameeting_abc123%40thread.v2/0?context=xyz',
      );
    });

    it('exposes raw priority and categories for the caller to map', () => {
      const { events } = parseSample();

      const [review] = findByTitle(events, 'Review architettura piattaforma');
      expect(review.priorityRaw).toBe(1);
      expect(review.categories).toEqual(['Red category']);
    });

    it('drops cancelled events', () => {
      const { events } = parseSample();

      expect(findByTitle(events, 'Riunione annullata')).toHaveLength(0);
    });
  });

  describe('all-day events', () => {
    it('marks them as all day and starts them at local midnight', () => {
      const { events } = parseSample();

      const [ferragosto] = findByTitle(events, 'Ferragosto');
      expect(ferragosto.allDay).toBe(true);
      expect(new Date(ferragosto.start).getHours()).toBe(0);
      expect(new Date(ferragosto.start).getDate()).toBe(15);
    });
  });

  describe('recurring events', () => {
    it('expands one occurrence per week inside the window', () => {
      const { events } = parseSample();

      const standups = events.filter((e) => e.uid === 'weekly-0002@lynxspa.com');
      // Mondays from 5 Oct to 30 Nov inclusive = 9, minus the EXDATE = 8.
      expect(standups).toHaveLength(8);
    });

    it('skips the occurrence listed in EXDATE', () => {
      const { events } = parseSample();

      const excluded = events.filter(
        (e) =>
          e.uid === 'weekly-0002@lynxspa.com' &&
          new Date(e.start).toISOString().startsWith('2026-10-19'),
      );
      expect(excluded).toHaveLength(0);
    });

    it('applies the RECURRENCE-ID override instead of the original slot', () => {
      const { events } = parseSample();

      const moved = findByTitle(events, 'Standup settimanale (spostato)');
      expect(moved).toHaveLength(1);
      expect(moved[0].start).toBe(Date.parse('2026-10-12T15:00:00+02:00'));
      // The 10:00 slot it replaces must not survive alongside it.
      const sameDay = events.filter(
        (e) =>
          e.uid === 'weekly-0002@lynxspa.com' &&
          new Date(e.start).toISOString().startsWith('2026-10-12'),
      );
      expect(sameDay).toHaveLength(1);
    });

    it('keeps the wall clock time across the end of daylight saving time', () => {
      const { events } = parseSample();

      const standups = events
        .filter((e) => e.uid === 'weekly-0002@lynxspa.com' && e.title === 'Standup settimanale')
        .sort((a, b) => a.start - b.start);

      // 26 Oct is the first Monday on CET (+01:00), 19 Oct would have been CEST
      // but is excluded, so compare against 12 Oct which is still CEST (+02:00).
      const beforeDst = standups.find((e) =>
        new Date(e.start).toISOString().startsWith('2026-10-05'),
      );
      const afterDst = standups.find((e) =>
        new Date(e.start).toISOString().startsWith('2026-10-26'),
      );

      expect(beforeDst.start).toBe(Date.parse('2026-10-05T10:00:00+02:00'));
      expect(afterDst.start).toBe(Date.parse('2026-10-26T10:00:00+01:00'));
    });

    it('honours the window and never returns occurrences outside it', () => {
      const { events } = parseSample({
        windowStart: Date.parse('2026-10-20T00:00:00Z'),
        windowEnd: Date.parse('2026-11-10T00:00:00Z'),
      });

      const standups = events.filter((e) => e.uid === 'weekly-0002@lynxspa.com');
      expect(standups).toHaveLength(3);
      for (const event of standups) {
        expect(event.start).toBeGreaterThanOrEqual(Date.parse('2026-10-20T00:00:00Z'));
        expect(event.start).toBeLessThanOrEqual(Date.parse('2026-11-10T00:00:00Z'));
      }
    });

    it('drops an exception that was moved out of the window', () => {
      const moved = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:moved@example.com',
        'SUMMARY:Weekly',
        'DTSTART:20260805T080000Z',
        'DTEND:20260805T090000Z',
        'RRULE:FREQ=WEEKLY;COUNT=3',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:moved@example.com',
        'RECURRENCE-ID:20260812T080000Z',
        'SUMMARY:Weekly (pushed to next year)',
        'DTSTART:20270812T080000Z',
        'DTEND:20270812T090000Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const { events } = parseIcs(moved, WINDOW);

      // The RRULE slot falls inside the window, but the exception moved the real
      // meeting a year out: it must not be reported as upcoming.
      expect(events.map((e) => e.title)).not.toContain('Weekly (pushed to next year)');
      expect(events).toHaveLength(2);
    });

    it('exposes a start key that does not depend on the machine time zone', () => {
      const { events } = parseSample();

      const [ferragosto] = findByTitle(events, 'Ferragosto');
      const [review] = findByTitle(events, 'Review architettura piattaforma');

      // All-day events are floating: the epoch shifts with the system zone, the
      // calendar representation does not.
      expect(ferragosto.startKey).toBe('2026-08-15');
      expect(review.startKey).toContain('2026-08-10');
    });

    it('caps runaway series and reports it as a warning', () => {
      const endless = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:endless@example.com',
        'SUMMARY:Daily forever',
        'DTSTART:20260801T080000Z',
        'DTEND:20260801T083000Z',
        'RRULE:FREQ=DAILY',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const { events, warnings } = parseIcs(endless, { ...WINDOW, maxInstancesPerSeries: 5 });

      expect(events).toHaveLength(5);
      expect(warnings.some((w) => w.includes('endless@example.com'))).toBe(true);
    });
  });

  describe('degraded and hostile input', () => {
    it('warns when the feed was published without event details', () => {
      const busy = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:busy-1@example.com',
        'SUMMARY:Busy',
        'DTSTART:20260810T080000Z',
        'DTEND:20260810T090000Z',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:busy-2@example.com',
        'SUMMARY:Occupato',
        'DTSTART:20260811T080000Z',
        'DTEND:20260811T090000Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const { events, warnings } = parseIcs(busy, WINDOW);

      expect(events).toHaveLength(2);
      expect(warnings.some((w) => w.includes('free/busy'))).toBe(true);
    });

    it('recognises the placeholder titles case-insensitively', () => {
      expect(TITLE_PLACEHOLDERS).toContain('busy');
    });

    it('returns no events and no warning for an empty calendar', () => {
      const empty = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR';

      const { events, warnings } = parseIcs(empty, WINDOW);

      expect(events).toEqual([]);
      expect(warnings).toEqual([]);
    });

    it('throws on input that is not an iCalendar document', () => {
      expect(() => parseIcs('<html>login page</html>', WINDOW)).toThrow(/not a valid iCalendar/i);
    });

    it('skips a malformed event but keeps the valid ones', () => {
      const mixed = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:no-start@example.com',
        'SUMMARY:Missing DTSTART',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:fine@example.com',
        'SUMMARY:Valid one',
        'DTSTART:20260810T080000Z',
        'DTEND:20260810T090000Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const { events, warnings } = parseIcs(mixed, WINDOW);

      expect(events).toHaveLength(1);
      expect(events[0].title).toBe('Valid one');
      expect(warnings.some((w) => w.includes('no-start@example.com'))).toBe(true);
    });

    it('defaults the end to the start when DTEND and DURATION are both absent', () => {
      const noEnd = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:no-end@example.com',
        'SUMMARY:Instant',
        'DTSTART:20260810T080000Z',
        'END:VEVENT',
        'END:VCALENDAR',
      ].join('\r\n');

      const { events } = parseIcs(noEnd, WINDOW);

      expect(events[0].end).toBe(events[0].start);
    });
  });
});

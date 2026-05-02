const { normalizeEvent, assignPriority } = require('../../integrations/google-calendar');

describe('google-calendar normalization', () => {
  describe('assignPriority', () => {
    it('returns 1 for red color events', () => {
      expect(assignPriority({ colorId: '11', summary: 'Normal meeting' })).toBe(1);
    });

    it('returns 2 for events with priority keywords in title', () => {
      expect(assignPriority({ summary: 'URGENT: fix prod' })).toBe(2);
      expect(assignPriority({ summary: 'Release v2.0 planning' })).toBe(2);
      expect(assignPriority({ summary: 'Deploy to staging' })).toBe(2);
    });

    it('returns 2 for events with priority keywords in description', () => {
      expect(assignPriority({ summary: 'Meeting', description: 'Discuss deadline for Q3' })).toBe(2);
    });

    it('returns 3 for normal events', () => {
      expect(assignPriority({ summary: 'Team standup' })).toBe(3);
      expect(assignPriority({ summary: 'Lunch with Marco' })).toBe(3);
    });

    it('handles missing summary gracefully', () => {
      expect(assignPriority({})).toBe(3);
    });

    it('uses custom keywords when provided', () => {
      expect(assignPriority({ summary: 'Board meeting' }, ['board', 'investor'])).toBe(2);
      expect(assignPriority({ summary: 'Team standup' }, ['board', 'investor'])).toBe(3);
    });
  });

  describe('normalizeEvent', () => {
    it('normalizes a timed event', () => {
      const event = {
        id: 'abc123',
        summary: 'Sprint Review',
        end: { dateTime: new Date(Date.now() + 3600000).toISOString() },
        start: { dateTime: new Date().toISOString() },
      };

      const result = normalizeEvent(event);

      expect(result.id).toBe('gcal_abc123');
      expect(result.source).toBe('gcal');
      expect(result.title).toBe('Sprint Review');
      expect(result.due_at).toBeGreaterThan(Date.now());
      expect(result.priority).toBe(3);
      expect(result.is_done).toBe(0);
    });

    it('normalizes all-day event with end.date', () => {
      const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
      const event = {
        id: 'allday1',
        summary: 'Conference Day',
        end: { date: tomorrow },
      };

      const result = normalizeEvent(event);
      expect(result.due_at).toBeGreaterThan(Date.now());
    });

    it('returns null for past events', () => {
      const event = {
        id: 'past1',
        summary: 'Old meeting',
        end: { dateTime: new Date(Date.now() - 3600000).toISOString() },
      };

      expect(normalizeEvent(event)).toBeNull();
    });

    it('assigns priority 1 for red events', () => {
      const event = {
        id: 'red1',
        summary: 'Critical',
        colorId: '11',
        end: { dateTime: new Date(Date.now() + 3600000).toISOString() },
      };

      const result = normalizeEvent(event);
      expect(result.priority).toBe(1);
    });

    it('stores raw event as JSON', () => {
      const event = {
        id: 'raw1',
        summary: 'Test',
        end: { dateTime: new Date(Date.now() + 3600000).toISOString() },
        description: 'Some details',
      };

      const result = normalizeEvent(event);
      const raw = JSON.parse(result.raw_json);
      expect(raw.description).toBe('Some details');
    });

    it('uses "(no title)" for events without summary', () => {
      const event = {
        id: 'notitle1',
        end: { dateTime: new Date(Date.now() + 3600000).toISOString() },
      };

      const result = normalizeEvent(event);
      expect(result.title).toBe('(no title)');
    });
  });
});

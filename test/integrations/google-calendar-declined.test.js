'use strict';

const { isDeclinedByUser, normalizeEvent } = require('../../integrations/google-calendar');

function makeEvent(overrides = {}) {
  return {
    id: 'meeting',
    summary: 'Planning meeting',
    start: { dateTime: '2030-06-01T10:00:00Z' },
    end: { dateTime: '2030-06-01T11:00:00Z' },
    ...overrides,
  };
}

describe('google-calendar declined attendance', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2030-05-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('excludes an event declined by the current user', () => {
    const event = makeEvent({ attendees: [{ self: true, responseStatus: 'declined' }] });

    const declined = isDeclinedByUser(event);
    const record = normalizeEvent(event, []);

    expect(declined).toBe(true);
    expect(record).toBeNull();
  });

  it.each(['accepted', 'needsAction', 'tentative'])(
    'includes an event with current user response %s',
    (responseStatus) => {
      const event = makeEvent({ attendees: [{ self: true, responseStatus }] });

      const declined = isDeclinedByUser(event);
      const record = normalizeEvent(event, []);

      expect(declined).toBe(false);
      expect(record).toMatchObject({ id: 'gcal_meeting', title: 'Planning meeting' });
    },
  );

  it('includes an event without attendees', () => {
    const event = makeEvent();

    const declined = isDeclinedByUser(event);
    const record = normalizeEvent(event, []);

    expect(declined).toBe(false);
    expect(record).toMatchObject({ id: 'gcal_meeting', title: 'Planning meeting' });
  });

  it('includes an event declined only by another attendee', () => {
    const event = makeEvent({ attendees: [{ self: false, responseStatus: 'declined' }] });

    const declined = isDeclinedByUser(event);
    const record = normalizeEvent(event, []);

    expect(declined).toBe(false);
    expect(record).toMatchObject({ id: 'gcal_meeting', title: 'Planning meeting' });
  });
});

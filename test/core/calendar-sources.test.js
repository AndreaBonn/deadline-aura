const {
  CALENDAR_SOURCES,
  CALENDAR_SOURCES_SQL,
  isCalendarSource,
} = require('../../core/calendar-sources');
const { extractCode } = require('../../core/postit-renderer');

describe('calendar sources', () => {
  it('treats both calendar feeds as calendar sources', () => {
    expect(isCalendarSource('gcal')).toBe(true);
    expect(isCalendarSource('outlook')).toBe(true);
  });

  it('does not treat backlog sources as calendar ones', () => {
    expect(isCalendarSource('jira')).toBe(false);
    expect(isCalendarSource('local')).toBe(false);
    expect(isCalendarSource('gtasks')).toBe(false);
  });

  it('quotes every source for use in a SQL IN clause', () => {
    for (const source of CALENDAR_SOURCES) {
      expect(CALENDAR_SOURCES_SQL).toContain(`'${source}'`);
    }
  });
});

describe('postit code extraction', () => {
  it('shows the event title for any calendar source, not only google', () => {
    expect(extractCode('gcal_abc', 'Review architettura')).toBe('Review architettura');
    expect(extractCode('outlook_abc_123', 'Standup settimanale')).toBe('Standup settimanale');
  });

  it('still extracts the project key for jira tasks', () => {
    expect(extractCode('jira_1', 'PLAT-42 fix the thing')).toBe('PLAT');
  });
});

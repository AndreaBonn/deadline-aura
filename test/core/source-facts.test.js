'use strict';

const { collectSourceFacts } = require('../../core/source-status');
const jira = require('../../integrations/jira');

function makeConfig() {
  return {
    sources: {
      google_calendar: { enabled: true },
      outlook: { enabled: true, ics_url: ' https://example.com/calendar.ics ' },
      jira: {
        enabled: true,
        instances: [
          { domain: 'a.atlassian.net', email: 'a@example.com', api_token: 'token' },
          { domain: 'b.atlassian.net', email: 'b@example.com', apiToken: 'token' },
          { domain: 'c.atlassian.net', email: 'c@example.com' },
          { email: 'd@example.com', api_token: 'token' },
          { domain: 'e.atlassian.net', api_token: 'token' },
        ],
      },
    },
  };
}

function makeGoogle(oauth = { clientId: 'id', clientSecret: 'secret' }, authorized = true) {
  return {
    resolveGoogleOAuth: vi.fn(() => oauth),
    isGoogleCalendarReady: vi.fn(() => authorized),
  };
}

describe('collectSourceFacts', () => {
  it('counts only complete Jira instances and preserves sync failures', () => {
    const config = makeConfig();
    const gcal = makeGoogle();
    expect(
      collectSourceFacts(config, {
        gcal,
        jira,
        lastSyncStatus: { failedSources: ['jira'] },
      }),
    ).toEqual({
      google: { enabled: true, hasCredentials: true, authorized: true },
      outlook: { enabled: true, hasUrl: true },
      jira: { enabled: true, instanceCount: 2 },
      failedSources: ['jira'],
    });
    expect(gcal.resolveGoogleOAuth).toHaveBeenCalledWith(config);
    expect(gcal.isGoogleCalendarReady).toHaveBeenCalledWith(config);
  });

  it.each([
    { clientId: '', clientSecret: 'secret' },
    { clientId: 'id', clientSecret: '' },
  ])('reports incomplete Google credentials: %j', (oauth) => {
    const result = collectSourceFacts(makeConfig(), {
      gcal: makeGoogle(oauth, false),
      jira,
      lastSyncStatus: null,
    });
    expect(result.google).toEqual({ enabled: true, hasCredentials: false, authorized: false });
    expect(result.failedSources).toEqual([]);
  });

  it.each([undefined, {}, { enabled: false }, { enabled: true, ics_url: '   ' }])(
    'reports no Outlook URL for missing or blank configuration: %j',
    (outlook) => {
      const config = makeConfig();
      config.sources.outlook = outlook;
      config.sources.google_calendar.enabled = false;
      config.sources.jira.enabled = false;
      const result = collectSourceFacts(config, {
        gcal: makeGoogle(),
        jira,
        lastSyncStatus: null,
      });
      expect(result.outlook).toEqual({ enabled: Boolean(outlook?.enabled), hasUrl: false });
      expect(result.google.enabled).toBe(false);
      expect(result.jira).toEqual({ enabled: false, instanceCount: 2 });
      expect(result.failedSources).toEqual([]);
    },
  );
});

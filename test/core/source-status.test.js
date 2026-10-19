'use strict';

const { describeSourceStatus } = require('../../core/source-status');

function makeInput(overrides = {}) {
  return {
    google: { enabled: true, hasCredentials: true, authorized: true },
    outlook: { enabled: false, hasUrl: false },
    jira: { enabled: true, instanceCount: 1 },
    failedSources: [],
    ...overrides,
  };
}

const stateOf = (list, id) => list.find((s) => s.id === id).state;

describe('describeSourceStatus', () => {
  it('lists the three sources in a fixed order', () => {
    expect(describeSourceStatus(makeInput()).map((s) => s.id)).toEqual([
      'google_calendar',
      'outlook',
      'jira',
    ]);
  });

  it('reports connected sources as ok and switched-off ones as off', () => {
    const list = describeSourceStatus(makeInput());

    expect(stateOf(list, 'google_calendar')).toBe('ok');
    expect(stateOf(list, 'outlook')).toBe('off');
    expect(stateOf(list, 'jira')).toBe('ok');
  });

  it('asks for setup when a source is on but its fields are missing', () => {
    const list = describeSourceStatus(
      makeInput({
        google: { enabled: true, hasCredentials: false, authorized: false },
        outlook: { enabled: true, hasUrl: false },
        jira: { enabled: true, instanceCount: 0 },
      }),
    );

    expect(list.map((s) => s.state)).toEqual(['setup', 'setup', 'setup']);
  });

  it('asks for authorization when Google has credentials but no granted access', () => {
    const list = describeSourceStatus(
      makeInput({ google: { enabled: true, hasCredentials: true, authorized: false } }),
    );

    expect(stateOf(list, 'google_calendar')).toBe('authorize');
  });

  it('asks for authorization rather than reporting an error before access is granted', () => {
    const list = describeSourceStatus(
      makeInput({
        google: { enabled: true, hasCredentials: true, authorized: false },
        failedSources: ['google_calendar'],
      }),
    );

    expect(stateOf(list, 'google_calendar')).toBe('authorize');
  });

  it('reports an error for a configured source that failed in the last sync', () => {
    const list = describeSourceStatus(makeInput({ failedSources: ['jira', 'google_calendar'] }));

    expect(stateOf(list, 'jira')).toBe('error');
    expect(stateOf(list, 'google_calendar')).toBe('error');
  });

  it('keeps "off" for a disabled source even if it failed earlier', () => {
    const list = describeSourceStatus(
      makeInput({ jira: { enabled: false, instanceCount: 1 }, failedSources: ['jira'] }),
    );

    expect(stateOf(list, 'jira')).toBe('off');
  });
});

'use strict';

const {
  isConfigDirty,
  tabForIssuePath,
  isGoogleConfigured,
  isJiraConfigured,
  hasAnyAiKey,
} = require('../../renderer/settings-helpers');

describe('isConfigDirty', () => {
  it('is clean when nothing changed since the last save', () => {
    expect(isConfigDirty({ a: { b: 1 } }, { a: { b: 1 } })).toBe(false);
  });

  it('is dirty when a nested value changed', () => {
    expect(isConfigDirty({ a: { b: 2 } }, { a: { b: 1 } })).toBe(true);
  });
});

describe('tabForIssuePath', () => {
  it.each([
    ['ai.provider_timeout_ms', 'ai'],
    ['sources.jira.instances.0.domain', 'sorgenti'],
    ['sync.data_interval_minutes', 'generale'],
    ['meeting_dock.lookahead_minutes', 'notifiche'],
    ['work_shift.regular.slots.0.start', 'turno'],
    ['engine.k_constant', 'avanzate'],
    ['language', 'ui'],
    ['wallpaper.show_ai_usage', 'limiti'],
    ['wallpaper.postit.max_per_display', 'wallpaper'],
  ])('maps %s to the %s tab', (path, tab) => {
    expect(tabForIssuePath(path)).toBe(tab);
  });

  it('returns null for a path no tab owns', () => {
    expect(tabForIssuePath('unknown.field')).toBeNull();
  });
});

describe('isGoogleConfigured', () => {
  it('needs both client id and secret', () => {
    expect(isGoogleConfigured({ oauth: { client_id: 'id', client_secret: 's' } })).toBe(true);
    expect(isGoogleConfigured({ oauth: { client_id: 'id', client_secret: '  ' } })).toBe(false);
  });

  it('is not configured when the oauth block is missing', () => {
    expect(isGoogleConfigured({})).toBe(false);
  });
});

describe('isJiraConfigured', () => {
  it('needs at least one instance with domain, email and token', () => {
    const jira = { instances: [{ domain: 'a.atlassian.net', email: 'x@y.z', api_token: 't' }] };

    expect(isJiraConfigured(jira)).toBe(true);
  });

  it('is not configured with an incomplete or missing instance', () => {
    expect(isJiraConfigured({ instances: [{ domain: 'a', email: '', api_token: 't' }] })).toBe(
      false,
    );
    expect(isJiraConfigured({ instances: [] })).toBe(false);
  });
});

describe('hasAnyAiKey', () => {
  it('is true when at least one provider key is filled in', () => {
    expect(hasAnyAiKey({ groq: '', gemini: 'k', openai: '', anthropic: '' })).toBe(true);
  });

  it('is false when every key is empty or blank', () => {
    expect(hasAnyAiKey({ groq: ' ', gemini: '' })).toBe(false);
    expect(hasAnyAiKey(undefined)).toBe(false);
  });
});

describe('describeIssue', () => {
  const { describeIssue } = require('../../renderer/settings-helpers');
  const translate = (key, params = {}) => `${key}:${params.n ?? ''}`;

  it('explains a value above the maximum with the limit', () => {
    expect(describeIssue({ code: 'too_big', maximum: 30000 }, translate)).toBe(
      'settings.err_max:30000',
    );
  });

  it('explains a value below the minimum with the limit', () => {
    expect(describeIssue({ code: 'too_small', minimum: 1 }, translate)).toBe('settings.err_min:1');
  });

  it('falls back to a generic sentence for other validation errors', () => {
    expect(describeIssue({ code: 'invalid_type' }, translate)).toBe('settings.save_error_generic:');
  });
});

describe('googleAuthMessage', () => {
  const { googleAuthMessage } = require('../../renderer/settings-helpers');
  const translate = (key, params = {}) => [key, params.error].filter(Boolean).join(':');

  it.each([
    [{ ok: true }, 'settings.google_auth_ok'],
    [{ ok: true, alreadyAuthorized: true }, 'settings.google_auth_already'],
    [{ ok: false, error: 'MISSING_CREDENTIALS' }, 'settings.google_auth_missing'],
    [{ ok: false, error: 'PORT_IN_USE' }, 'settings.google_auth_port'],
    [{ ok: false, error: 'AUTH_IN_PROGRESS' }, 'settings.google_auth_busy'],
  ])('maps %j to %s', (result, expected) => {
    expect(googleAuthMessage(result, translate)).toEqual({
      text: expected,
      ok: result.ok,
    });
  });

  it('keeps the underlying reason for any other failure', () => {
    expect(googleAuthMessage({ ok: false, error: 'OAuth timeout' }, translate)).toEqual({
      text: 'settings.google_auth_failed:OAuth timeout',
      ok: false,
    });
  });
});

describe('jiraVerifyMessage', () => {
  const { jiraVerifyMessage } = require('../../renderer/settings-helpers');
  const translate = (key, params = {}) =>
    [key, params.n, params.code].filter((x) => x !== undefined).join(':');

  it('reports the number of issues found', () => {
    expect(jiraVerifyMessage({ ok: true, count: 6, more: false }, translate)).toEqual({
      text: 'settings.jira_verify_ok:6',
      ok: true,
    });
  });

  it('says "more than" when the first page is full', () => {
    expect(jiraVerifyMessage({ ok: true, count: 50, more: true }, translate).text).toBe(
      'settings.jira_verify_more:50',
    );
  });

  it.each([
    ['AUTH_FAILED', 'settings.jira_verify_auth'],
    ['NOT_FOUND', 'settings.jira_verify_not_found'],
    ['INVALID_JQL', 'settings.jira_verify_jql'],
    ['UNREACHABLE', 'settings.jira_verify_unreachable'],
    ['MISSING_FIELDS', 'settings.jira_verify_missing'],
    ['INVALID_DOMAIN', 'settings.jira_verify_domain'],
  ])('maps %s to %s', (error, key) => {
    expect(jiraVerifyMessage({ ok: false, error }, translate)).toEqual({ text: key, ok: false });
  });

  it('shows the status code for an unexpected HTTP error', () => {
    expect(jiraVerifyMessage({ ok: false, error: 'HTTP_502' }, translate).text).toBe(
      'settings.jira_verify_http:HTTP_502',
    );
  });
});

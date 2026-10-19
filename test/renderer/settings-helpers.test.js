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

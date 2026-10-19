'use strict';

const {
  isConfigDirty,
  tabForIssuePath,
  isGoogleConfigured,
  isJiraConfigured,
  hasAnyAiKey,
  buildMonthGridCells,
  describeSaveError,
  withRenderFills,
} = require('../../renderer/settings-helpers');

describe('buildMonthGridCells', () => {
  it.each([
    ['2026-02', 28, 6, 35],
    ['2024-02', 29, 3, 35],
    ['2000-02', 29, 1, 35],
    ['1900-02', 28, 3, 35],
    ['2026-04', 30, 2, 35],
    ['2026-03', 31, 6, 42],
    ['2026-06', 30, 0, 35],
    ['2021-02', 28, 0, 28],
  ])('lays out %s Monday-first', (monthKey, days, offset, total) => {
    const cells = buildMonthGridCells(monthKey, {});
    const dates = cells.filter(Boolean);

    expect(cells).toHaveLength(total);
    expect(cells.slice(0, offset)).toEqual(Array(offset).fill(null));
    expect(dates.map((cell) => cell.day)).toEqual(
      Array.from({ length: days }, (_, index) => index + 1),
    );
    expect(cells[offset]).toEqual({ day: 1, dayStr: '1', hasShift: undefined, slots: undefined });
    expect(cells.slice(offset + days)).toEqual(Array(total - offset - days).fill(null));
  });

  it('keeps each day shift state and slots without changing month data', () => {
    const slots = Object.freeze([Object.freeze({ start: '09:00', end: '17:00' })]);
    const monthData = Object.freeze({ 1: slots, 2: Object.freeze([]) });

    expect(buildMonthGridCells('2026-06', monthData).slice(0, 3)).toEqual([
      { day: 1, dayStr: '1', hasShift: true, slots: [{ start: '09:00', end: '17:00' }] },
      { day: 2, dayStr: '2', hasShift: false, slots: [] },
      { day: 3, dayStr: '3', hasShift: undefined, slots: undefined },
    ]);
    expect(monthData).toEqual({ 1: [{ start: '09:00', end: '17:00' }], 2: [] });
  });

  it.each([undefined, null])('preserves the error for absent month data: %s', (monthData) => {
    expect(buildMonthGridCells('2026-06', {})).toHaveLength(35);
    expect(() => buildMonthGridCells('2026-06', monthData)).toThrow(TypeError);
  });

  it.each(['bad', '2026', '2026-nope', ''])('keeps one empty row for invalid %j', (key) => {
    expect(buildMonthGridCells(key, {})).toEqual(Array(7).fill(null));
  });

  it('preserves Date normalization of an overflowing month', () => {
    expect(buildMonthGridCells('2026-13', {})).toEqual(buildMonthGridCells('2027-01', {}));
  });

  it('preserves the error for a non-string month key', () => {
    expect(buildMonthGridCells('bad', {})).toEqual(Array(7).fill(null));
    expect(() => buildMonthGridCells(null, {})).toThrow(TypeError);
  });
});

describe('describeSaveError', () => {
  const translate = (key, params = {}) => [key, ...Object.values(params)].join(':');
  const labelForTab = (tab) => ({ ai: 'AI', sorgenti: 'Sources' })[tab];

  it.each([{}, { issues: [] }, { issues: null }])('uses the generic error for %j', (result) => {
    expect(describeSaveError(result, translate, labelForTab)).toBe('settings.save_error_generic');
  });

  it.each([
    [{ code: 'too_big', maximum: 20 }, 'settings.err_max:20'],
    [{ code: 'too_small', minimum: 1 }, 'settings.err_min:1'],
    [{ code: 'invalid_type' }, 'settings.save_error_generic'],
    [{ code: 'too_big' }, 'settings.save_error_generic'],
    [{ code: 'too_small' }, 'settings.save_error_generic'],
  ])('describes the first issue %j using the injected tab label', (issue, detail) => {
    const result = { issues: [{ ...issue, path: 'ai.provider_timeout_ms' }, { path: 'unknown' }] };
    expect(describeSaveError(result, translate, labelForTab)).toBe(
      `settings.save_error_tab:AI:${detail}`,
    );
  });

  it('passes the owning tab to the label resolver', () => {
    expect(describeSaveError({ issues: [{ path: 'sources.jira' }] }, translate, labelForTab)).toBe(
      'settings.save_error_tab:Sources:settings.save_error_generic',
    );
  });

  it('includes an unknown path without looking up a tab label', () => {
    const resolveLabel = () => {
      throw new Error('Unexpected tab lookup');
    };
    expect(
      describeSaveError({ issues: [{ path: 'unknown.field' }] }, translate, resolveLabel),
    ).toBe('settings.save_error_generic (unknown.field)');
  });
});

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

describe('withRenderFills', () => {
  it('adds a block the render filled in and the saved snapshot lacks', () => {
    const saved = { sidebar: { width: 260 } };
    const before = { sidebar: { width: 300 } };
    const after = { sidebar: { width: 300 }, meeting_dock: { enabled: true } };
    expect(withRenderFills(saved, before, after)).toEqual({
      sidebar: { width: 260 },
      meeting_dock: { enabled: true },
    });
  });

  it('adds a key the render filled inside an existing block, keeping edited values', () => {
    const saved = { ai: { enabled: true } };
    const before = { ai: { enabled: false } };
    const after = { ai: { enabled: false, timeout: 30 } };
    expect(withRenderFills(saved, before, after)).toEqual({ ai: { enabled: true, timeout: 30 } });
  });

  it('leaves out a key the user created before the render', () => {
    const saved = { months: {} };
    const before = { months: { '2026-11': { 15: [] } } };
    const after = { months: { '2026-11': { 15: [] } } };
    expect(withRenderFills(saved, before, after)).toEqual({ months: {} });
  });

  it('keeps saved arrays as they are', () => {
    const saved = { tags: ['a'] };
    expect(withRenderFills(saved, { tags: ['a', 'b'] }, { tags: ['a', 'b'] })).toEqual({
      tags: ['a'],
    });
  });

  it('returns a new object and leaves every input unchanged', () => {
    const saved = { a: { b: 1 } };
    const before = { a: { b: 1 } };
    const after = { a: { b: 1, c: 2 } };
    const result = withRenderFills(saved, before, after);
    expect(result).not.toBe(saved);
    expect(saved).toEqual({ a: { b: 1 } });
    expect(before).toEqual({ a: { b: 1 } });
    expect(after).toEqual({ a: { b: 1, c: 2 } });
    expect(result.a).toEqual({ b: 1, c: 2 });
  });
});

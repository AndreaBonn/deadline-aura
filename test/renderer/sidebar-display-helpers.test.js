'use strict';

const { priorityKey, formatScore100, withoutFavorites } = require('../../renderer/sidebar-utils');

describe('priorityKey', () => {
  it('maps P1 to the critical label', () => {
    expect(priorityKey(1)).toBe('priorities.critical');
  });

  it('maps P2, P3 and P4 to high, medium and low', () => {
    expect([priorityKey(2), priorityKey(3), priorityKey(4)]).toEqual([
      'priorities.high',
      'priorities.medium',
      'priorities.low',
    ]);
  });

  it('returns null for a task without priority', () => {
    expect(priorityKey(null)).toBeNull();
    expect(priorityKey(undefined)).toBeNull();
  });

  it('returns null for an out-of-range priority', () => {
    expect(priorityKey(7)).toBeNull();
  });
});

describe('formatScore100', () => {
  it('turns the 0-1 score into a value out of 100', () => {
    expect(formatScore100(0.63)).toBe('63/100');
  });

  it('rounds to the nearest integer', () => {
    expect(formatScore100(0.636)).toBe('64/100');
  });

  it('clamps values outside the 0-1 range', () => {
    expect(formatScore100(1.4)).toBe('100/100');
    expect(formatScore100(-0.2)).toBe('0/100');
  });
});

describe('withoutFavorites', () => {
  const tasks = [{ id: 'jira_1' }, { id: 'jira_2' }, { id: 'jira_3' }];

  it('drops the tasks already shown among the favorites', () => {
    const result = withoutFavorites(tasks, new Set(['jira_2']));

    expect(result.map((task) => task.id)).toEqual(['jira_1', 'jira_3']);
  });

  it('keeps every task when there are no favorites', () => {
    expect(withoutFavorites(tasks, new Set())).toHaveLength(3);
  });

  it('does not mutate the input list', () => {
    withoutFavorites(tasks, new Set(['jira_1']));

    expect(tasks).toHaveLength(3);
  });
});

describe('flybyStateKey', () => {
  const { flybyStateKey } = require('../../renderer/sidebar-utils');
  const NOW = 1_000_000;

  it('reports active when enabled and not snoozed', () => {
    expect(flybyStateKey({ enabled: true, snoozed_until: null }, NOW)).toBe(
      'flyby_menu.state_active',
    );
  });

  it('reports snoozed while the snooze is still running', () => {
    expect(flybyStateKey({ enabled: true, snoozed_until: NOW + 1 }, NOW)).toBe(
      'flyby_menu.state_snoozed',
    );
  });

  it('reports active again once the snooze has expired', () => {
    expect(flybyStateKey({ enabled: true, snoozed_until: NOW - 1 }, NOW)).toBe(
      'flyby_menu.state_active',
    );
  });

  it('reports disabled even when a snooze is also set', () => {
    expect(flybyStateKey({ enabled: false, snoozed_until: NOW + 1 }, NOW)).toBe(
      'flyby_menu.state_disabled',
    );
  });
});

describe('formatSyncStatus', () => {
  const { formatSyncStatus } = require('../../renderer/sidebar-utils');
  const translate = (key, params = {}) =>
    key === 'sidebar.updated_at'
      ? `Updated ${params.time}`
      : key === 'sidebar.sync_problem'
        ? `Not responding: ${params.sources}`
        : key;
  const formatTime = () => '14:50';

  it('shows when the last sync finished', () => {
    const view = formatSyncStatus({ at: 1, failedSources: [] }, translate, formatTime);

    expect(view).toEqual({ text: 'Updated 14:50', problem: null });
  });

  it('names the sources that did not respond, with their display names', () => {
    const view = formatSyncStatus(
      { at: 1, failedSources: ['jira', 'google_calendar'] },
      translate,
      formatTime,
    );

    expect(view.problem).toBe('Not responding: Jira, Google Calendar');
  });

  it('shows a placeholder before the first sync', () => {
    expect(formatSyncStatus(null, translate, formatTime)).toEqual({ text: '--', problem: null });
  });
});

describe('urgencyToTextColor', () => {
  const { urgencyToTextColor, urgencyToColor } = require('../../renderer/sidebar-utils');

  it('keeps the hue of the border color for the same score', () => {
    const hue = (hsl) => hsl.match(/hsl\((\d+)/)[1];

    expect(hue(urgencyToTextColor(0.7))).toBe(hue(urgencyToColor(0.7)));
  });

  it('is light enough to read on the dark sidebar at every score', () => {
    const lightness = (hsl) => Number(hsl.match(/(\d+)%\)$/)[1]);

    for (const score of [0, 0.5, 1]) {
      expect(lightness(urgencyToTextColor(score))).toBeGreaterThanOrEqual(62);
    }
  });
});

describe('escapeHtml', () => {
  const { escapeHtml } = require('../../renderer/sidebar-utils');

  it('escapes markup characters', () => {
    expect(escapeHtml('<b>&')).toBe('&lt;b&gt;&amp;');
  });

  it('escapes quotes so the value is safe inside an attribute', () => {
    expect(escapeHtml(`a"b'c`)).toBe('a&quot;b&#39;c');
  });

  it('turns null and undefined into an empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

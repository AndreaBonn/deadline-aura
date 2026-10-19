'use strict';

const { summarizeSync } = require('../../core/sync-status');

describe('summarizeSync', () => {
  const NOW = 1_760_000_000_000;

  it('records when the sync finished and that nothing failed', () => {
    expect(summarizeSync({ errors: [] }, NOW)).toEqual({ at: NOW, failedSources: [] });
  });

  it('lists each failed data source once, in order of appearance', () => {
    const result = {
      errors: [
        { source: 'jira', message: 'timeout' },
        { source: 'outlook', message: '404' },
        { source: 'jira', message: 'again' },
      ],
    };

    expect(summarizeSync(result, NOW).failedSources).toEqual(['jira', 'outlook']);
  });

  it('leaves AI scoring failures out, since the score panel already explains them', () => {
    const result = { errors: [{ source: 'ai', message: 'rate limit' }] };

    expect(summarizeSync(result, NOW).failedSources).toEqual([]);
  });

  it('treats a missing error list as a clean sync', () => {
    expect(summarizeSync({}, NOW).failedSources).toEqual([]);
  });
});

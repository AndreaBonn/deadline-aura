const { normalizeIssue, mapJiraPriority, buildAuthHeader } = require('../../integrations/jira');

describe('jira normalization', () => {
  describe('mapJiraPriority', () => {
    it('maps Highest to 1', () => {
      expect(mapJiraPriority('Highest')).toBe(1);
    });

    it('maps Blocker to 1', () => {
      expect(mapJiraPriority('Blocker')).toBe(1);
    });

    it('maps High to 2', () => {
      expect(mapJiraPriority('High')).toBe(2);
    });

    it('maps Medium to 3', () => {
      expect(mapJiraPriority('Medium')).toBe(3);
    });

    it('maps Low to 4', () => {
      expect(mapJiraPriority('Low')).toBe(4);
    });

    it('maps Lowest to 4', () => {
      expect(mapJiraPriority('Lowest')).toBe(4);
    });

    it('returns 3 for unknown priority', () => {
      expect(mapJiraPriority('CustomPriority')).toBe(3);
    });

    it('returns 3 for null priority', () => {
      expect(mapJiraPriority(null)).toBe(3);
    });
  });

  describe('normalizeIssue', () => {
    it('normalizes a standard Jira issue', () => {
      const issue = {
        id: '10042',
        key: 'AUTH-441',
        fields: {
          summary: 'Fix login timeout',
          priority: { name: 'High' },
          duedate: '2026-05-05',
          status: { name: 'In Progress' },
        },
      };

      const result = normalizeIssue(issue);

      expect(result.id).toBe('jira_10042');
      expect(result.source).toBe('jira');
      expect(result.title).toBe('AUTH-441 · Fix login timeout');
      expect(result.priority).toBe(2);
      expect(result.is_done).toBe(0);
      expect(result.due_at).toBeGreaterThan(0);
    });

    it('handles issue without duedate', () => {
      const issue = {
        id: '10043',
        key: 'DASH-100',
        fields: {
          summary: 'Update dashboard',
          priority: { name: 'Medium' },
          duedate: null,
        },
      };

      const result = normalizeIssue(issue);
      expect(result.due_at).toBeNull();
    });

    it('handles issue without summary', () => {
      const issue = {
        id: '10044',
        key: 'BUG-1',
        fields: { priority: { name: 'Low' } },
      };

      const result = normalizeIssue(issue);
      expect(result.title).toBe('BUG-1 · (no title)');
    });

    it('stores raw issue as JSON', () => {
      const issue = {
        id: '10045',
        key: 'API-1',
        fields: {
          summary: 'Rate limiting',
          priority: { name: 'Medium' },
          duedate: '2026-05-10',
        },
      };

      const result = normalizeIssue(issue);
      const raw = JSON.parse(result.raw_json);
      expect(raw.key).toBe('API-1');
    });

    it('builds web_url from domain and issue key', () => {
      const issue = {
        id: '10047',
        key: 'PROJ-42',
        fields: {
          summary: 'Some task',
          priority: { name: 'Medium' },
          duedate: '2026-05-10',
        },
      };

      const result = normalizeIssue(issue, 'mycompany.atlassian.net');
      expect(result.web_url).toBe('https://mycompany.atlassian.net/browse/PROJ-42');
    });

    it('returns null web_url when domain is not provided', () => {
      const issue = {
        id: '10048',
        key: 'PROJ-43',
        fields: {
          summary: 'Another task',
          priority: { name: 'Low' },
          duedate: null,
        },
      };

      const result = normalizeIssue(issue);
      expect(result.web_url).toBeNull();
    });

    it('sets due_at to end of day for duedate', () => {
      const issue = {
        id: '10046',
        key: 'TST-1',
        fields: {
          summary: 'Test',
          priority: { name: 'Medium' },
          duedate: '2026-05-05',
        },
      };

      const result = normalizeIssue(issue);
      const dueDate = new Date(result.due_at);
      expect(dueDate.getHours()).toBe(23);
      expect(dueDate.getMinutes()).toBe(59);
    });
  });

  describe('buildAuthHeader', () => {
    it('creates valid Basic auth header', () => {
      const header = buildAuthHeader('user@example.com', 'my-token');
      const decoded = Buffer.from(header.replace('Basic ', ''), 'base64').toString();
      expect(decoded).toBe('user@example.com:my-token');
    });
  });
});

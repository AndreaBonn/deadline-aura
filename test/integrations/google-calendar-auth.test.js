'use strict';

// Must mock googleapis before requiring the module
vi.mock('googleapis', () => {
  const mockOAuth2 = vi.fn().mockImplementation(() => ({
    generateAuthUrl: vi.fn().mockReturnValue('https://accounts.google.com/auth'),
    getToken: vi.fn().mockResolvedValue({ tokens: { access_token: 'at', refresh_token: 'rt' } }),
    setCredentials: vi.fn(),
    on: vi.fn(),
  }));

  return {
    google: {
      auth: { OAuth2: mockOAuth2 },
      calendar: vi.fn(),
    },
  };
});

const gcal = require('../../integrations/google-calendar');

describe('google-calendar — getLookaheadEnd', () => {
  // getLookaheadEnd is not exported, but we can test its behavior via fetchEvents
  // For now we test assignPriority edge cases and normalizeEvent edge cases not covered

  describe('normalizeEvent — edge: event with end.date in the past', () => {
    it('returns null for all-day event that ended yesterday', () => {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      const event = {
        id: 'past_allday',
        summary: 'Past All-Day',
        end: { date: yesterday },
      };
      expect(gcal.normalizeEvent(event)).toBeNull();
    });
  });

  describe('normalizeEvent — edge: event with no end at all', () => {
    it('returns event with null due_at and null endTime (not filtered as past)', () => {
      const event = {
        id: 'no_end',
        summary: 'Endless',
      };
      const result = gcal.normalizeEvent(event);
      // endTime is null → not past → returned
      expect(result).not.toBeNull();
      expect(result.due_at).toBeNull();
      expect(result.all_day).toBe(false);
    });
  });
});

describe('google-calendar — loadSavedToken (via getAuthenticatedClient)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('TOKEN_PATH is exported and points to config dir', () => {
    expect(gcal.TOKEN_PATH).toContain('deadlineaura');
    expect(gcal.TOKEN_PATH).toContain('google-token.json');
  });
});

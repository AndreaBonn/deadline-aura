'use strict';

const { buildMeetUrlWithAccount } = require('../../core/meet-url-builder');

describe('buildMeetUrlWithAccount', () => {
  it('appends authuser to meet.google.com URLs', () => {
    const result = buildMeetUrlWithAccount(
      'https://meet.google.com/abc-defg-hij',
      'user@example.com',
    );
    expect(result).toBe('https://meet.google.com/abc-defg-hij?authuser=user%40example.com');
  });

  it('appends authuser to hangouts.google.com URLs', () => {
    const result = buildMeetUrlWithAccount(
      'https://hangouts.google.com/call/abc123',
      'user@example.com',
    );
    expect(result).toContain('authuser=user%40example.com');
  });

  it('does not modify non-Google URLs', () => {
    const url = 'https://zoom.us/j/123456';
    expect(buildMeetUrlWithAccount(url, 'user@example.com')).toBe(url);
  });

  it('returns URL unchanged when no google account', () => {
    const url = 'https://meet.google.com/abc';
    expect(buildMeetUrlWithAccount(url, '')).toBe(url);
    expect(buildMeetUrlWithAccount(url, null)).toBe(url);
    expect(buildMeetUrlWithAccount(url, undefined)).toBe(url);
  });

  it('handles invalid URLs gracefully', () => {
    expect(buildMeetUrlWithAccount('not-a-url', 'user@example.com')).toBe('not-a-url');
  });

  it('preserves existing query parameters', () => {
    const result = buildMeetUrlWithAccount(
      'https://meet.google.com/abc?hs=122',
      'user@example.com',
    );
    expect(result).toContain('hs=122');
    expect(result).toContain('authuser=user%40example.com');
  });
});

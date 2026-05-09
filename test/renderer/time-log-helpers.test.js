'use strict';

// Test the pure helper logic used by sidebar time-log feature.
// These functions are inline in sidebar.js; we replicate them here to test the logic.

const JIRA_KEY_PATTERN = /\b([A-Z][A-Z0-9]+-\d+)\b/;

function extractJiraKey(title) {
  const match = title.match(JIRA_KEY_PATTERN);
  return match ? match[1] : null;
}

function buildEventSummary(jiraKey, title) {
  if (!jiraKey) {
    return title;
  }
  const cleanTitle = title
    .replace(jiraKey, '')
    .replace(/^[\s·-]+/, '')
    .trim();
  return '[' + jiraKey + '] - ' + cleanTitle;
}

describe('time-log helpers', () => {
  describe('extractJiraKey', () => {
    it('extracts key from Jira-style title with dot separator', () => {
      expect(extractJiraKey('PROJ-123 · Fix login page')).toBe('PROJ-123');
    });

    it('extracts key from title with dash separator', () => {
      expect(extractJiraKey('DATA-7 - Review dashboard')).toBe('DATA-7');
    });

    it('extracts key embedded in longer text', () => {
      expect(extractJiraKey('Working on TEAM-42 today')).toBe('TEAM-42');
    });

    it('returns null when no Jira key present', () => {
      expect(extractJiraKey('Fix the login page')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(extractJiraKey('')).toBeNull();
    });

    it('returns null for lowercase keys', () => {
      expect(extractJiraKey('proj-123 fix bug')).toBeNull();
    });

    it('handles multi-letter project codes', () => {
      expect(extractJiraKey('DEADLINEAURA-99 · Setup CI')).toBe('DEADLINEAURA-99');
    });

    it('handles alphanumeric project codes', () => {
      expect(extractJiraKey('AB2C-15 task')).toBe('AB2C-15');
    });
  });

  describe('buildEventSummary', () => {
    it('formats Jira key with brackets and dash', () => {
      const result = buildEventSummary('PROJ-123', 'PROJ-123 · Fix login page');
      expect(result).toBe('[PROJ-123] - Fix login page');
    });

    it('cleans leading separators and whitespace', () => {
      const result = buildEventSummary('DATA-7', 'DATA-7 - Review dashboard');
      expect(result).toBe('[DATA-7] - Review dashboard');
    });

    it('returns title as-is when no jiraKey', () => {
      const result = buildEventSummary(null, 'Just a local task');
      expect(result).toBe('Just a local task');
    });

    it('handles key at start without separator', () => {
      const result = buildEventSummary('TEAM-1', 'TEAM-1 deploy');
      expect(result).toBe('[TEAM-1] - deploy');
    });

    it('handles key embedded in title', () => {
      const result = buildEventSummary('AB-5', 'Fix AB-5 asap');
      expect(result).toBe('[AB-5] - Fix  asap');
    });
  });
});

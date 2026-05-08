'use strict';

const { extractCode } = require('../../core/postit-renderer');

describe('extractCode', () => {
  describe('jira tasks', () => {
    it('returns project key from issue key in title', () => {
      expect(extractCode('jira_32836', 'TAGIT-95 · Problema Colloqui')).toBe('TAGIT');
    });

    it('returns project key for multi-segment project keys', () => {
      expect(extractCode('jira_12345', 'AMAWP-1 · Preparazione materiale')).toBe('AMAWP');
    });

    it('returns project key for numeric-suffixed keys', () => {
      expect(extractCode('jira_99999', 'PPM-202 · Tirocinio Ludovico')).toBe('PPM');
    });

    it('returns JIRA fallback when title has no issue key', () => {
      expect(extractCode('jira_00001', 'Task senza codice')).toBe('JIRA');
    });

    it('returns JIRA fallback when title is empty', () => {
      expect(extractCode('jira_00001', '')).toBe('JIRA');
    });

    it('returns JIRA fallback when title is null', () => {
      expect(extractCode('jira_00001', null)).toBe('JIRA');
    });
  });

  describe('gcal tasks', () => {
    it('returns title for gcal_ prefix', () => {
      expect(extractCode('gcal_abc123', 'Treno Milano-Bologna')).toBe('Treno Milano-Bologna');
    });

    it('returns title for gcal- prefix', () => {
      expect(extractCode('gcal-abc123', 'Whitebox AI')).toBe('Whitebox AI');
    });

    it('returns Calendar fallback when title is empty', () => {
      expect(extractCode('gcal_abc123', '')).toBe('Calendar');
    });
  });

  describe('local tasks', () => {
    it('returns TODO for local_ prefix', () => {
      expect(extractCode('local_1234_abc12345', 'Pagare bolletta')).toBe('TODO');
    });

    it('returns TODO regardless of title', () => {
      expect(extractCode('local_9999_ff00ff00', '')).toBe('TODO');
    });
  });

  describe('unknown source', () => {
    it('returns taskId as-is for unknown prefix', () => {
      expect(extractCode('unknown_xyz', 'Some task')).toBe('unknown_xyz');
    });
  });
});

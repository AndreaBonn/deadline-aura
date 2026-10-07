'use strict';

const {
  validateLocalTaskCreate,
  validateLocalTaskUpdate,
} = require('../../core/local-task-validation');

describe.each([
  ['create', validateLocalTaskCreate],
  ['update', validateLocalTaskUpdate],
])('local task %s validation', (_name, validate) => {
  it.each(['', '   ', null, 42, false])('rejects invalid title %j', (title) => {
    const input = { id: 'task-1', title, priority: 3 };
    const result = validate(input);
    expect(result).toBe('INVALID_TITLE');
  });

  it.each([0, 5, 1.5, 'high', null])('rejects invalid priority %j', (priority) => {
    const input = { id: 'task-1', title: 'Prepare meeting', priority };
    const result = validate(input);
    expect(result).toBe('INVALID_PRIORITY');
  });

  it.each([1, 4, '3', undefined])('accepts valid priority %j with a padded title', (priority) => {
    const input = { id: 'task-1', title: '  Prepare meeting  ', priority };
    const result = validate(input);
    expect(result).toBe(null);
  });

  it('reports invalid title before invalid priority', () => {
    const input = { id: 'task-1', title: '', priority: 0 };
    const result = validate(input);
    expect(result).toBe('INVALID_TITLE');
  });
});

describe('validateLocalTaskCreate', () => {
  it('requires a title when creating a task', () => {
    const result = validateLocalTaskCreate({ title: undefined, priority: 3 });
    expect(result).toBe('INVALID_TITLE');
  });
});

describe('validateLocalTaskUpdate', () => {
  it.each(['', undefined, null, 12, false])('rejects invalid id %j before other fields', (id) => {
    const result = validateLocalTaskUpdate({ id, title: '', priority: 0 });
    expect(result).toBe('INVALID_ID');
  });

  it.each([
    { id: 'task-1' },
    { id: 'task-1', title: undefined, priority: undefined },
    { id: 'task-1', title: undefined, priority: 1 },
    { id: 'task-1', title: 'Prepare meeting', priority: undefined },
    { id: ' ' },
  ])('accepts omitted fields and preserves the existing id contract: %j', (input) => {
    const result = validateLocalTaskUpdate(input);
    expect(result).toBe(null);
  });

  it('still validates priority when title is omitted', () => {
    const result = validateLocalTaskUpdate({ id: 'task-1', priority: 5 });
    expect(result).toBe('INVALID_PRIORITY');
  });
});

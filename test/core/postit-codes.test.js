const { withPostitCodes, extractCode } = require('../../core/postit-renderer');

describe('postit-renderer - withPostitCodes', () => {
  it('labels a Jira task with the project key taken from its title', () => {
    const tasks = [{ task_id: 'jira_10042', title: 'AB-5 Fix login' }];

    const [labelled] = withPostitCodes(tasks);

    expect(labelled.code).toBe('AB');
  });

  it('labels a calendar event with its title, never the raw gcal_ id', () => {
    const tasks = [{ task_id: 'gcal_abc123', title: 'Standup' }];

    const [labelled] = withPostitCodes(tasks);

    expect(labelled.code).toBe('Standup');
  });

  it('uses the same label the wallpaper post-it draws', () => {
    const task = { task_id: 'outlook_xyz', title: 'Review' };

    const [labelled] = withPostitCodes([task]);

    expect(labelled.code).toBe(extractCode(task.task_id, task.title));
  });

  it('keeps every other field and leaves the input untouched', () => {
    const task = { task_id: 'jira_1', title: 'CD-9 Deploy', x_pct: 12, y_pct: 30 };

    const [labelled] = withPostitCodes([task]);

    expect({ labelled, original: task }).toEqual({
      labelled: { task_id: 'jira_1', title: 'CD-9 Deploy', x_pct: 12, y_pct: 30, code: 'CD' },
      original: { task_id: 'jira_1', title: 'CD-9 Deploy', x_pct: 12, y_pct: 30 },
    });
  });

  it('returns an empty array for no pinned tasks', () => {
    expect(withPostitCodes([])).toEqual([]);
  });
});

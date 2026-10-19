// @vitest-environment happy-dom
'use strict';

const { loadSidebarPage, buildTask, outline, findCard, chooseMenuItem } = require('./harness');

const DUE = new Date(2026, 10, 5, 10, 30).getTime();
const UNDO_WINDOW_MS = 5000;

let page;
afterEach(() => {
  page.dispose();
  vi.useRealTimers();
});

async function loadWith(tasks, extra = {}) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  page = await loadSidebarPage();
  await page.update({ tasks, ...extra });
  return page;
}

function key(el, name) {
  el.dispatchEvent(new page.win.KeyboardEvent('keydown', { key: name, bubbles: true }));
}

describe('sections', () => {
  it('groups tasks of every source into sections, in the fixed order, sorting calendars by deadline', async () => {
    await loadWith(
      [
        buildTask({ id: 'j1', source: 'jira', title: 'ABC-1 Jira task' }),
        buildTask({ id: 'j2', source: 'jira', title: 'ABC-2 Favourite task' }),
        buildTask({ id: 'o1', source: 'outlook', title: 'Outlook meeting', due_at: 5 }),
        buildTask({ id: 'g2', source: 'gcal', title: 'Later event', due_at: 2000 }),
        buildTask({ id: 'g1', source: 'gcal', title: 'Earlier event', due_at: 1000 }),
        buildTask({ id: 'gt', source: 'gtasks', title: 'Google task' }),
        buildTask({ id: 'l1', source: 'local', title: 'Local task' }),
      ],
      { favoriteTaskIds: ['j2'] },
    );

    expect(outline(page.document)).toEqual([
      '# Personali',
      'Local task',
      '# Google Tasks',
      'Google task',
      '# Google Calendar',
      'Earlier event',
      'Later event',
      '# Outlook',
      'Outlook meeting',
      '# Preferiti Jira',
      'ABC-2 Favourite task',
      '# Jira',
      'ABC-1 Jira task',
    ]);
  });

  it('collapses a long section to five cards and expands it on request', async () => {
    const many = Array.from({ length: 7 }, (_, i) =>
      buildTask({ id: 'l' + i, title: 'Task ' + i }),
    );
    await loadWith(many);

    expect(page.document.querySelectorAll('.task-card')).toHaveLength(5);
    const expand = page.document.querySelector('.expand-btn');
    expect(expand.textContent).toBe('Mostra tutti (2 altri)');
    expand.click();
    expect(page.document.querySelectorAll('.task-card')).toHaveLength(7);
  });
});

describe('empty list', () => {
  it('shows the start card, and its first step opens the quick-add form', async () => {
    await loadWith([]);

    expect(page.document.querySelector('.start-card')).not.toBeNull();
    expect(page.document.querySelector('#startCardTitle').textContent).toBe('Inizia da qui');
    expect(page.document.querySelectorAll('.start-step')).toHaveLength(3);
    expect(page.document.querySelector('.task-card')).toBeNull();

    page.document.querySelector('.start-step-btn').click();

    expect(page.document.querySelector('.start-card')).toBeNull();
    expect(page.document.querySelector('#quickAddTitle')).not.toBeNull();
  });

  it('opens the settings from the second step', async () => {
    await loadWith([]);

    page.document.querySelectorAll('.start-step-btn')[1].click();

    expect(page.bridge.callsTo('openConfig')).toEqual([[]]);
  });

  it('does not show the start card once a task exists', async () => {
    await loadWith([buildTask({ title: 'Existing' })]);

    expect(outline(page.document)).toEqual(['# Personali', 'Existing']);
    expect(page.document.querySelector('.start-card')).toBeNull();
  });
});

describe('quick add', () => {
  async function openForm() {
    await loadWith([buildTask({ id: 'existing', title: 'Existing' })]);
    page.document.querySelector('.local-add-toggle').click();
    return {
      title: page.document.querySelector('#quickAddTitle'),
      date: page.document.querySelector('#quickAddDate'),
      priority: page.document.querySelector('#quickAddPriority'),
      save: page.document.querySelector('.quick-add-save'),
    };
  }

  it.each(['', '   '])('sends nothing for the title %j', async (value) => {
    const form = await openForm();
    form.title.value = value;

    form.save.click();

    expect(page.bridge.callsTo('createLocalTask')).toEqual([]);
    expect(page.document.querySelector('#quickAddTitle')).not.toBeNull();
  });

  it('creates the task with the exact payload from title, date and priority', async () => {
    const form = await openForm();
    form.title.value = '  Buy milk  ';
    form.date.value = '2026-11-05T10:30';
    form.priority.value = '2';

    form.save.click();

    expect(page.bridge.callsTo('createLocalTask')).toEqual([
      [{ title: 'Buy milk', dueAt: DUE, priority: 2 }],
    ]);
  });

  // happy-dom selects the wrong <option> when `option.selected = true` is set before the option
  // is attached (it picks index 1), so the preselected P3 cannot be asserted through
  // select.value here. Tests always choose the priority explicitly.
  it('offers the four priorities and sends dueAt null without a deadline; Enter saves too', async () => {
    const form = await openForm();
    form.title.value = 'No date';
    form.priority.value = '1';

    key(form.title, 'Enter');

    expect([...form.priority.options].map((o) => o.textContent)).toEqual([
      'P1 - Critico',
      'P2 - Alto',
      'P3 - Medio',
      'P4 - Basso',
    ]);
    expect(page.bridge.callsTo('createLocalTask')).toEqual([
      [{ title: 'No date', dueAt: null, priority: 1 }],
    ]);
  });

  it('closes the form and lists the new task once the main process pushes it', async () => {
    const form = await openForm();
    form.title.value = 'Buy milk';
    form.save.click();

    await page.update({
      tasks: [
        buildTask({ id: 'existing', title: 'Existing' }),
        buildTask({ id: 'new', title: 'Buy milk' }),
      ],
    });

    expect(page.document.querySelector('.quick-add-form')).toBeNull();
    expect(outline(page.document)).toEqual(['# Personali', 'Existing', 'Buy milk']);
  });

  it('Escape closes the form without sending anything', async () => {
    const form = await openForm();

    key(form.title, 'Escape');

    expect(page.document.querySelector('.quick-add-form')).toBeNull();
    expect(page.bridge.callsTo('createLocalTask')).toEqual([]);
  });
});

describe('edit a local task', () => {
  async function openEdit() {
    await loadWith([buildTask({ id: 'l1', title: 'Old title', priority: 4, due_at: DUE })]);
    chooseMenuItem(findCard(page.document, 'Old title'), 'Modifica');
    return {
      title: page.document.querySelector('.edit-form-card .quick-add-input'),
      date: page.document.querySelector('.edit-form-card .quick-add-date'),
      priority: page.document.querySelector('.edit-form-card .quick-add-priority'),
      save: page.document.querySelector('.edit-form-card .quick-add-save'),
    };
  }

  it('prefills title and deadline from the task', async () => {
    const form = await openEdit();

    expect(form.title.value).toBe('Old title');
    expect(form.date.value).toBe('2026-11-05T10:30');
  });

  it('updates the task with its id and the edited fields', async () => {
    const form = await openEdit();
    form.title.value = ' New title ';
    form.priority.value = '1';

    form.save.click();

    expect(page.bridge.callsTo('updateLocalTask')).toEqual([
      [{ id: 'l1', title: 'New title', dueAt: DUE, priority: 1 }],
    ]);
  });

  it('refuses an empty title', async () => {
    const form = await openEdit();
    form.title.value = '  ';

    form.save.click();

    expect(page.bridge.callsTo('updateLocalTask')).toEqual([]);
  });

  it('cancel restores the card and sends nothing', async () => {
    await openEdit();

    page.document.querySelector('.edit-form-card .local-action-btn').click();

    expect(outline(page.document)).toEqual(['# Personali', 'Old title']);
    expect(page.bridge.callsTo('updateLocalTask')).toEqual([]);
  });
});

describe('delete with undo', () => {
  async function deleteFirst() {
    await loadWith([
      buildTask({ id: 'l1', title: 'Doomed' }),
      buildTask({ id: 'l2', title: 'Safe' }),
    ]);
    chooseMenuItem(findCard(page.document, 'Doomed'), 'Elimina');
  }

  it('hides the task at once and shows the undo toast, without any IPC yet', async () => {
    await deleteFirst();

    expect(page.document.querySelector('.undo-toast').textContent).toContain('«Doomed» eliminato');
    expect(outline(page.document)).toEqual(['# Personali', 'Safe']);
    expect(page.bridge.callsTo('deleteLocalTask')).toEqual([]);
  });

  it('undo brings the task back and the delete never reaches the main process', async () => {
    await deleteFirst();

    page.document.querySelector('.undo-toast-btn').click();
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);

    expect(page.document.querySelector('.undo-toast')).toBeNull();
    expect(outline(page.document)).toEqual(['# Personali', 'Doomed', 'Safe']);
    expect(page.bridge.callsTo('deleteLocalTask')).toEqual([]);
  });

  it('a delete after an undo gets its own full window, not the old countdown', async () => {
    await deleteFirst();
    vi.advanceTimersByTime(3000);
    page.document.querySelector('.undo-toast-btn').click();

    chooseMenuItem(findCard(page.document, 'Safe'), 'Elimina');
    vi.advanceTimersByTime(3000);

    expect(page.bridge.callsTo('deleteLocalTask')).toEqual([]);
    vi.advanceTimersByTime(2000);
    expect(page.bridge.callsTo('deleteLocalTask')).toEqual([['l2']]);
  });

  it('without undo, deletes exactly once when the 5 s window ends', async () => {
    await deleteFirst();

    vi.advanceTimersByTime(UNDO_WINDOW_MS - 1);
    expect(page.bridge.callsTo('deleteLocalTask')).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(page.bridge.callsTo('deleteLocalTask')).toEqual([['l1']]);
    vi.advanceTimersByTime(UNDO_WINDOW_MS * 2);

    expect(page.bridge.callsTo('deleteLocalTask')).toEqual([['l1']]);
    expect(page.document.querySelector('.undo-toast')).toBeNull();
    expect(outline(page.document)).toEqual(['# Personali', 'Safe']);
  });

  it('closing the page inside the window still deletes the task', async () => {
    await deleteFirst();

    page.win.dispatchEvent(new page.win.Event('pagehide'));

    expect(page.bridge.callsTo('deleteLocalTask')).toEqual([['l1']]);
  });

  it('deleting a second task commits the first one immediately', async () => {
    await deleteFirst();

    chooseMenuItem(findCard(page.document, 'Safe'), 'Elimina');

    expect(page.bridge.callsTo('deleteLocalTask')).toEqual([['l1']]);
    expect(page.document.querySelector('.undo-toast').textContent).toContain('«Safe»');
  });
});

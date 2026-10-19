// @vitest-environment happy-dom
'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const { Window } = require('happy-dom');

let win;
beforeEach(() => {
  win = new Window();
  win.deadlineAura = { deleteLocalTask: vi.fn() };
  win.document.body.innerHTML = '<div id="tasksContainer"></div>';
  vm.runInContext(
    `const sidebarState = { pendingDelete: null, lastTasks: [], lastPalette: null,
      jiraFilter: '', addFormVisible: false, favoriteTaskIds: new Set(), activeTimer: null };
    const rendered = [];
    function rerender() { rendered.push(sidebarState.lastTasks.map((x) => x.id)); }
    function t(key, params) { return params ? key + JSON.stringify(params) : key; }
    function createTaskCard(task) {
      const card = document.createElement('div');
      card.className = 'task-card';
      card.textContent = task.id;
      return card;
    }`,
    win,
  );
  vm.runInContext(fs.readFileSync('renderer/sidebar-sections.js', 'utf8'), win, {
    filename: require('node:path').resolve('renderer/sidebar-sections.js'),
  });
});
afterEach(() => {
  vi.useRealTimers();
  win.close();
});

function fakeWindowTimers() {
  vi.useFakeTimers();
  win.setTimeout = setTimeout;
  win.clearTimeout = clearTimeout;
}

const run = (code) => vm.runInContext(code, win);
const tasks = (n) => Array.from({ length: n }, (_, i) => ({ id: `T${i}`, title: `Task ${i}` }));

describe('delete with undo', () => {
  beforeEach(() => {
    run(`sidebarState.lastTasks = [{ id: 'A' }, { id: 'B' }]`);
  });

  it('keeps the IPC delete waiting until the undo window closes', () => {
    fakeWindowTimers();
    run(`requestLocalDelete({ id: 'A' })`);
    vi.advanceTimersByTime(4999);
    expect(win.deadlineAura.deleteLocalTask).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(win.deadlineAura.deleteLocalTask.mock.calls).toEqual([['A']]);
    expect(run('sidebarState.pendingDelete')).toBeNull();
    expect(run('sidebarState.lastTasks.map((x) => x.id)')).toEqual(['B']);
  });

  it('undo cancels the delete for good', () => {
    fakeWindowTimers();
    run(`requestLocalDelete({ id: 'A' })`);
    run('undoPendingDelete()');
    vi.advanceTimersByTime(10000);
    expect(win.deadlineAura.deleteLocalTask).not.toHaveBeenCalled();
    expect(run('sidebarState.lastTasks.length')).toBe(2);
  });

  it('a second delete commits the first one immediately', () => {
    fakeWindowTimers();
    run(`requestLocalDelete({ id: 'A' })`);
    run(`requestLocalDelete({ id: 'B' })`);
    expect(win.deadlineAura.deleteLocalTask.mock.calls).toEqual([['A']]);
    expect(run('sidebarState.pendingDelete.task.id')).toBe('B');
  });

  it('commit and undo without a pending delete do nothing', () => {
    run('commitPendingDelete(); undoPendingDelete()');
    expect(win.deadlineAura.deleteLocalTask).not.toHaveBeenCalled();
    expect(run('rendered.length')).toBe(0);
  });
});

describe('renderSection', () => {
  const container = () => win.document.getElementById('tasksContainer');
  const cards = () => container().querySelectorAll('.task-card').length;

  it('shows every card and no toggle up to the collapse limit', () => {
    run(
      `renderSection(document.getElementById('tasksContainer'), 'Title', ${JSON.stringify(tasks(5))}, 'gcal')`,
    );
    expect(cards()).toBe(5);
    expect(container().querySelector('.expand-btn')).toBeNull();
    expect(container().querySelector('.section-count')).toBeNull();
  });

  it('collapses to 5 cards, shows the total and the hidden count', () => {
    run(
      `renderSection(document.getElementById('tasksContainer'), 'Title', ${JSON.stringify(tasks(8))}, 'gcal')`,
    );
    expect(cards()).toBe(5);
    expect(container().querySelector('.section-count').textContent).toBe(' (8)');
    expect(container().querySelector('.expand-btn').textContent).toBe('sidebar.show_all{"n":3}');
  });

  it('remembers the expanded state per section and rerenders on toggle', () => {
    run(
      `renderSection(document.getElementById('tasksContainer'), 'Title', ${JSON.stringify(tasks(8))}, 'gcal')`,
    );
    container().querySelector('.expand-btn').click();
    expect(container().dataset.expanded_gcal).toBe('1');
    expect(run('rendered.length')).toBe(1);
  });
});

describe('renderTaskList', () => {
  it('renders the Jira search with the empty-state text matching the filter', () => {
    run(`sidebarState.jiraFilter = 'zzz'`);
    run(`groupTasksForSections = () => ({ visibleTasks: [], isEmpty: false, gcal: [], outlook: [],
      jira: [], local: [], gtasks: [], favorites: [] })`);
    run(`createQuickAddForm = () => document.createElement('form')`);
    run(`createUndoToast = () => document.createElement('div')`);
    run(`createStartCard = () => document.createElement('div')`);
    run(`renderTaskList([], { accent_hex: '#fff' })`);
    const container = win.document.getElementById('tasksContainer');
    expect(container.querySelector('.jira-search').value).toBe('zzz');
    expect([...container.querySelectorAll('.empty-state')].map((el) => el.textContent)).toEqual([
      'sidebar.no_local_tasks',
      'sidebar.no_results',
    ]);
  });
});

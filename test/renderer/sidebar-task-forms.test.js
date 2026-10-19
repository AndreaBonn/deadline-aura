// @vitest-environment happy-dom
'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const { Window } = require('happy-dom');

let win;
beforeEach(() => {
  win = new Window();
  win.deadlineAura = { createLocalTask: vi.fn(), updateLocalTask: vi.fn() };
  win.redraw = vi.fn();
  vm.runInContext(
    `const sidebarState = { addFormVisible: true, editingTaskId: 'task' };
    function rerender() { window.redraw(); }
    function t(key) { return 'translated:' + key; }`,
    win,
  );
  for (const file of ['sidebar-form-values.js', 'sidebar-task-forms.js']) {
    vm.runInContext(fs.readFileSync('renderer/' + file, 'utf8'), win);
  }
});
afterEach(() => win.close());

function formFor(kind) {
  const form = vm.runInContext(
    kind === 'edit'
      ? "createEditForm({ id: 'task', title: 'Original', priority: 2, due_at: null })"
      : 'createQuickAddForm()',
    win,
  );
  win.document.body.appendChild(form);
  return form;
}

describe('task form priorities', () => {
  it.each(['edit', 'quick'])('preserves ordered priority labels in %s', (kind) => {
    const select = formFor(kind).querySelector('select');
    expect([...select.options].map((option) => [option.value, option.textContent])).toEqual(
      [1, 2, 3, 4].map((value) => [
        String(value),
        kind === 'edit' ? 'P' + value : 'translated:priorities.p' + value + '_full',
      ]),
    );
  });
});

describe.each(['edit', 'quick'])('%s task form keyboard', (kind) => {
  it('saves the title and priority with Enter', () => {
    const input = formFor(kind).querySelector('input');
    input.value = '  New title  ';
    win.document.querySelector('select').value = '4';
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Enter' }));
    const api = win.deadlineAura;
    expect(kind === 'edit' ? api.updateLocalTask : api.createLocalTask).toHaveBeenCalledWith({
      ...(kind === 'edit' ? { id: 'task' } : {}),
      title: 'New title',
      dueAt: null,
      priority: 4,
    });
    expect(
      vm.runInContext(
        kind === 'edit' ? 'sidebarState.editingTaskId' : 'sidebarState.addFormVisible',
        win,
      ),
    ).toBe(kind === 'edit' ? null : false);
  });
  it('closes and redraws with Escape', () => {
    const input = formFor(kind).querySelector('input');
    input.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(win.redraw).toHaveBeenCalledOnce();
    expect(
      vm.runInContext(
        kind === 'edit' ? 'sidebarState.editingTaskId' : 'sidebarState.addFormVisible',
        win,
      ),
    ).toBe(kind === 'edit' ? null : false);
  });
});

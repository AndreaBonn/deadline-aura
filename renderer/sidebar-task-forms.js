'use strict';

/* global t, sidebarState, rerender, readTaskFormValues, toDateTimeLocalValue, priorityOptions */

function createTaskPrioritySelect(task) {
  const select = document.createElement('select');
  select.className = 'quick-add-priority';
  if (!task) {
    select.id = 'quickAddPriority';
  }
  for (const { value, selected } of priorityOptions(task)) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = task ? 'P' + value : t('priorities.p' + value + '_full');
    option.selected = selected;
    select.appendChild(option);
  }
  return select;
}

function createTaskFormFields(task) {
  const title = document.createElement('input');
  title.type = 'text';
  title.className = 'quick-add-input';
  const date = document.createElement('input');
  date.type = 'datetime-local';
  date.className = 'quick-add-date';
  if (task) {
    title.value = task.title;
    if (task.due_at) {
      date.value = toDateTimeLocalValue(new Date(task.due_at));
    }
  } else {
    title.id = 'quickAddTitle';
    title.placeholder = t('sidebar.task_title_placeholder');
    date.id = 'quickAddDate';
  }
  return { title, date, priority: createTaskPrioritySelect(task) };
}

function closeTaskForm(task) {
  if (task) {
    sidebarState.editingTaskId = null;
  } else {
    sidebarState.addFormVisible = false;
  }
}

function saveTaskForm(fields, task) {
  const values = readTaskFormValues({
    title: fields.title.value,
    date: fields.date.value,
    priority: fields.priority.value,
  });
  if (values.error) {
    fields.title.focus();
    return;
  }
  if (task) {
    window.deadlineAura.updateLocalTask({ id: task.id, ...values });
  } else {
    window.deadlineAura.createLocalTask(values);
  }
  closeTaskForm(task);
}

function bindTaskFormKeyboard(title, save, task) {
  title.addEventListener('keydown', function (event) {
    if (event.key === 'Enter') {
      save.click();
    }
    if (event.key === 'Escape') {
      closeTaskForm(task);
      rerender();
    }
  });
}

function createTaskFormCancel(task) {
  const cancel = document.createElement('button');
  cancel.className = 'local-action-btn';
  cancel.textContent = '\u2715';
  cancel.title = t('common.cancel');
  cancel.addEventListener('click', function () {
    closeTaskForm(task);
    rerender();
  });
  return cancel;
}

function buildTaskForm(task) {
  const form = document.createElement('div');
  form.className = task ? 'task-card edit-form-card' : 'quick-add-form';
  const fields = createTaskFormFields(task);
  const row = document.createElement('div');
  row.className = 'quick-add-row';
  const save = document.createElement('button');
  save.className = 'quick-add-save';
  save.textContent = t(task ? 'common.save' : 'common.add');
  save.addEventListener('click', function () {
    saveTaskForm(fields, task);
  });
  bindTaskFormKeyboard(fields.title, save, task);
  row.appendChild(fields.date);
  row.appendChild(fields.priority);
  row.appendChild(save);
  if (task) {
    row.appendChild(createTaskFormCancel(task));
  }
  form.appendChild(fields.title);
  form.appendChild(row);
  return form;
}

function createEditForm(task) {
  return buildTaskForm(task);
}

function createQuickAddForm() {
  return buildTaskForm(null);
}

if (typeof module !== 'undefined') {
  module.exports = { createEditForm, createQuickAddForm };
}

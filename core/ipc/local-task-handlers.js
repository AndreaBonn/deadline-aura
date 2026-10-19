'use strict';

const { validateLocalTaskCreate, validateLocalTaskUpdate } = require('../local-task-validation');

const { DEFAULT_PRIORITY } = require('../task-priority');
const INVALID_ID = { ok: false, error: 'INVALID_ID' };

function isValidId(taskId) {
  return Boolean(taskId) && typeof taskId === 'string';
}

function createTask({ localQueries, refresh }) {
  return ({ title, dueAt, priority }) => {
    const error = validateLocalTaskCreate({ title, priority });
    if (error) {
      return { ok: false, error };
    }
    const p = priority !== undefined ? Number(priority) : DEFAULT_PRIORITY;
    const id = localQueries.createLocalTask({ title: title.trim(), dueAt, priority: p });
    refresh({ force: true });
    return { ok: true, id };
  };
}

function updateTask({ localQueries, refresh }) {
  return ({ id, title, dueAt, priority }) => {
    const error = validateLocalTaskUpdate({ id, title, priority });
    if (error) {
      return { ok: false, error };
    }
    localQueries.updateLocalTask({
      id,
      title: title !== undefined ? title.trim() : undefined,
      dueAt,
      priority,
    });
    refresh({ force: true });
    return { ok: true };
  };
}

function byId({ localQueries, refresh }, method) {
  return (taskId) => {
    if (!isValidId(taskId)) {
      return INVALID_ID;
    }
    localQueries[method](taskId);
    refresh({ force: true });
    return { ok: true };
  };
}

/**
 * Build the local-task IPC handlers.
 * @param {object} deps - Injected dependencies.
 * @param {object} deps.localQueries - Store with create/update/delete/completeLocalTask.
 * @param {Function} deps.refresh - Runs an update cycle; called as refresh({ force: true }).
 * @returns {Object<string, Function>} Channel -> handler(payload).
 */
function createLocalTaskHandlers(deps) {
  return {
    'local-task:create': createTask(deps),
    'local-task:update': updateTask(deps),
    'local-task:delete': byId(deps, 'deleteLocalTask'),
    'local-task:complete': byId(deps, 'completeLocalTask'),
  };
}

module.exports = { createLocalTaskHandlers };

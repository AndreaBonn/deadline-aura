'use strict';

const MIN_PRIORITY = 1;
const MAX_PRIORITY = 4;

function isValidTitle(title) {
  return typeof title === 'string' && Boolean(title.trim());
}

function isValidPriority(priority) {
  const value = Number(priority);
  return Number.isInteger(value) && value >= MIN_PRIORITY && value <= MAX_PRIORITY;
}

/**
 * Validate task creation; an omitted priority uses the handler's default.
 * @param {object} input - Task fields received through IPC.
 * @returns {string|null} The first validation error, or null for valid fields.
 */
function validateLocalTaskCreate({ title, priority }) {
  if (!isValidTitle(title)) {
    return 'INVALID_TITLE';
  }
  if (priority !== undefined && !isValidPriority(priority)) {
    return 'INVALID_PRIORITY';
  }
  return null;
}

/**
 * Validate task updates, skipping title and priority when undefined.
 * @param {object} input - Task fields received through IPC.
 * @returns {string|null} The first validation error, or null for valid fields.
 */
function validateLocalTaskUpdate({ id, title, priority }) {
  if (!id || typeof id !== 'string') {
    return 'INVALID_ID';
  }
  if (title !== undefined && !isValidTitle(title)) {
    return 'INVALID_TITLE';
  }
  if (priority !== undefined && !isValidPriority(priority)) {
    return 'INVALID_PRIORITY';
  }
  return null;
}

module.exports = { validateLocalTaskCreate, validateLocalTaskUpdate };

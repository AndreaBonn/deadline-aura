'use strict';

/**
 * Build the favorite/unfavorite handlers: fire-and-forget channels that update
 * the store and force a refresh so the sidebar reflects the change.
 *
 * @param {object} deps - Injected collaborators.
 * @param {{favoriteTask: Function, unfavoriteTask: Function}} deps.favoriteQueries
 * @param {(options: {force: boolean}) => unknown} deps.refresh - Runs an update cycle.
 * @returns {{on: Object<string, Function>}}
 */
function createTaskFavoriteHandlers({ favoriteQueries, refresh }) {
  const change = (method) => (taskId) => {
    favoriteQueries[method](taskId);
    refresh({ force: true });
  };
  return {
    on: {
      'task:favorite': change('favoriteTask'),
      'task:unfavorite': change('unfavoriteTask'),
    },
  };
}

module.exports = { createTaskFavoriteHandlers };

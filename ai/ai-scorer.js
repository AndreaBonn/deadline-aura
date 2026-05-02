'use strict';

const providerManager = require('./provider-manager');

async function scoreTasks(tasks, config) {
  if (!config.ai?.enabled) {
    return null;
  }

  if (!tasks || tasks.length === 0) {
    return null;
  }

  return providerManager.scoreEvents(tasks, config);
}

module.exports = { scoreTasks };

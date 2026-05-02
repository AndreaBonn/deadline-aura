'use strict';

const { execSync } = require('child_process');

let lastNotifiedAt = 0;

function shouldNotify(engineResult, config) {
  if (!config.notifications.enabled) {
    return false;
  }

  if (engineResult.global_score < config.notifications.threshold_score) {
    return false;
  }

  const cooldownMs = config.notifications.cooldown_minutes * 60000;
  if (Date.now() - lastNotifiedAt < cooldownMs) {
    return false;
  }

  const criticalTask = engineResult.tasks.find((t) => t.urgency_score > 0.9);
  return criticalTask !== undefined;
}

function findMostUrgentTask(tasks) {
  return tasks.reduce((most, task) => {
    if (!most) {
      return task;
    }
    if (task.urgency_score > most.urgency_score) {
      return task;
    }
    if (task.urgency_score === most.urgency_score && task.priority < most.priority) {
      return task;
    }
    return most;
  }, null);
}

function formatCountdown(hoursRemaining) {
  if (hoursRemaining === null) {
    return '';
  }
  if (hoursRemaining < 0) {
    return 'scaduto';
  }
  if (hoursRemaining < 1) {
    return `tra ${Math.round(hoursRemaining * 60)} minuti`;
  }
  return `tra ${Math.round(hoursRemaining)} ore`;
}

function send(engineResult, config) {
  if (!shouldNotify(engineResult, config)) {
    return { sent: false };
  }

  const task = findMostUrgentTask(engineResult.tasks);
  if (!task) {
    return { sent: false };
  }

  const countdown = formatCountdown(task.hours_remaining);
  const body = `${task.title} ${countdown}`.trim();

  try {
    execSync(
      `notify-send --urgency=normal --app-name="DeadlineAura" "Scadenza imminente" "${body.replace(/"/g, '\\"')}"`,
      { timeout: 5000 },
    );
    lastNotifiedAt = Date.now();
    return { sent: true, task: task.id };
  } catch {
    return { sent: false, error: 'notify-send failed' };
  }
}

module.exports = { send, shouldNotify, findMostUrgentTask, formatCountdown };

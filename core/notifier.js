'use strict';

const childProcess = require('child_process');

let lastNotifiedAt = 0;
let lastBurnoutNotifiedAt = 0;

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
    const result = childProcess.spawnSync(
      'notify-send',
      ['--urgency=normal', '--app-name=DeadlineAura', 'Scadenza imminente', body],
      { timeout: 5000, encoding: 'utf-8' },
    );
    if (result.error || result.status !== 0) {
      return { sent: false, error: 'notify-send failed' };
    }
    lastNotifiedAt = Date.now();
    return { sent: true, task: task.id };
  } catch {
    return { sent: false, error: 'notify-send failed' };
  }
}

function sendBurnoutWarning(warning, config) {
  if (!config.notifications.enabled) {
    return { sent: false };
  }

  const cooldownMs = (config.burnout?.cooldown_hours || 24) * 3600000;
  if (Date.now() - lastBurnoutNotifiedAt < cooldownMs) {
    return { sent: false, reason: 'cooldown' };
  }

  const title =
    warning.severity === 'high' ? 'Rischio burnout elevato' : 'Attenzione: rischio burnout';
  const body = warning.triggers.join('\n');

  try {
    const result = childProcess.spawnSync(
      'notify-send',
      ['--urgency=critical', '--app-name=DeadlineAura', title, body],
      { timeout: 5000, encoding: 'utf-8' },
    );
    if (result.error || result.status !== 0) {
      return { sent: false, error: 'notify-send failed' };
    }
    lastBurnoutNotifiedAt = Date.now();
    return { sent: true, severity: warning.severity };
  } catch {
    return { sent: false, error: 'notify-send failed' };
  }
}

function _resetForTest() {
  lastNotifiedAt = 0;
  lastBurnoutNotifiedAt = 0;
}

module.exports = {
  send,
  shouldNotify,
  findMostUrgentTask,
  formatCountdown,
  sendBurnoutWarning,
  _resetForTest,
};

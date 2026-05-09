'use strict';

const { t } = require('../i18n');

const POSTIT_WIDTH = 220;
const POSTIT_HEIGHT = 100;
const POSTIT_PADDING = 14;
const POSTIT_RADIUS = 6;
const HEADER_HEIGHT = 28;
const SHADOW_BLUR = 12;
const SHADOW_OFFSET_Y = 4;
const MAX_TITLE_LINES = 2;
const TITLE_LINE_HEIGHT = 16;
const CODE_FONT_SIZE = 11;
const TITLE_FONT_SIZE = 12;
const COUNTDOWN_FONT_SIZE = 10;

const PRIORITY_COLORS = {
  1: '#ef4444',
  2: '#f97316',
  3: '#3b82f6',
  4: '#6b7280',
};

function getPostitColor(priority) {
  return PRIORITY_COLORS[priority] || PRIORITY_COLORS[3];
}

function formatCountdown(dueAt) {
  if (!dueAt) {
    return '';
  }
  const hoursRemaining = (dueAt - Date.now()) / 3600000;
  if (hoursRemaining < 0) {
    return t('postit.expired');
  }
  if (hoursRemaining < 1) {
    return `${Math.round(hoursRemaining * 60)}m`;
  }
  if (hoursRemaining < 24) {
    return `${Math.floor(hoursRemaining)}h`;
  }
  return `${Math.round(hoursRemaining / 24)}${t('countdown.days_short')}`;
}

function extractCode(taskId, title) {
  if (taskId.startsWith('gcal_') || taskId.startsWith('gcal-')) {
    return title || t('postit.calendar_fallback');
  }
  if (taskId.startsWith('jira_') || taskId.startsWith('jira-')) {
    const match = title && title.match(/^([A-Z][A-Z0-9]*)-\d+/);
    return match ? match[1] : t('postit.jira_fallback');
  }
  if (taskId.startsWith('local_')) {
    return t('postit.todo');
  }
  return taskId;
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0] || '';

  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + ' ' + words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth) {
      lines.push(currentLine);
      currentLine = words[i];
    } else {
      currentLine = testLine;
    }
  }
  lines.push(currentLine);
  return lines.slice(0, MAX_TITLE_LINES);
}

function renderPostit(ctx, { task, x, y, scale }) {
  const s = scale || 1;
  const w = POSTIT_WIDTH * s;
  const h = POSTIT_HEIGHT * s;
  const pad = POSTIT_PADDING * s;
  const r = POSTIT_RADIUS * s;
  const headerH = HEADER_HEIGHT * s;
  const accentColor = getPostitColor(task.priority);
  const countdown = formatCountdown(task.due_at);
  const code = extractCode(task.task_id, task.title);

  // Shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = SHADOW_BLUR * s;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = SHADOW_OFFSET_Y * s;

  // Card background
  ctx.fillStyle = 'rgba(18, 20, 30, 0.92)';
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.restore();

  // Accent header bar
  ctx.fillStyle = accentColor;
  ctx.beginPath();
  ctx.roundRect(x, y, w, headerH, [r, r, 0, 0]);
  ctx.fill();

  // Task code in header
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.font = `bold ${CODE_FONT_SIZE * s}px "Ubuntu Mono", "Consolas", monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(code, x + pad, y + headerH / 2);

  // Countdown in header right
  if (countdown) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.font = `${COUNTDOWN_FONT_SIZE * s}px "Ubuntu", system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(countdown, x + w - pad, y + headerH / 2);
  }

  // Title body
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.font = `500 ${TITLE_FONT_SIZE * s}px "Ubuntu", system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const titleMaxWidth = w - pad * 2;
  const lines = wrapText(ctx, task.title, titleMaxWidth);
  const titleY = y + headerH + pad * 0.6;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x + pad, titleY + i * TITLE_LINE_HEIGHT * s);
  }

  // Left accent border
  ctx.fillStyle = accentColor;
  ctx.fillRect(x, y + headerH, 3 * s, h - headerH);
}

function renderPostits(ctx, pinnedTasks, region) {
  const scale = Math.max(region.width / 1920, 0.8);

  for (const task of pinnedTasks) {
    const x = region.x + (task.x_pct / 100) * region.width;
    const y = region.y + (task.y_pct / 100) * region.height;
    renderPostit(ctx, { task, x, y, scale });
  }
}

module.exports = {
  renderPostit,
  renderPostits,
  extractCode,
  POSTIT_WIDTH,
  POSTIT_HEIGHT,
};

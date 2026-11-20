'use strict';

const { t } = require('../i18n');
const { truncateText } = require('./canvas-text');

const AGENDA_BAND_GAP = 10;

function filterUpcomingEvents(allTasks) {
  const now = Date.now();
  const horizon = now + 24 * 3600 * 1000;

  return allTasks
    .filter((t) => {
      const time = t.start_at || t.due_at;
      if (!time) {
        return false;
      }
      return time >= now && time <= horizon;
    })
    .sort((a, b) => (a.start_at || a.due_at) - (b.start_at || b.due_at));
}

// Label keys, not labels: the language can change while the app runs.
const AGENDA_BADGES = {
  gcal: { key: 'wallpaper.cal_badge', color: 'rgba(66, 133, 244, 0.5)' },
  gtasks: { key: 'wallpaper.tasks_badge', color: 'rgba(52, 168, 83, 0.5)' },
  jira: { key: 'wallpaper.jira_badge', color: 'rgba(255, 152, 0, 0.5)' },
  outlook: { key: 'wallpaper.outlook_badge', color: 'rgba(0, 120, 212, 0.5)' },
  local: { key: 'wallpaper.local_badge', color: 'rgba(171, 71, 188, 0.5)' },
};
const FALLBACK_BADGE_SOURCE = 'jira';

const AGENDA_MARGIN = 48;
const AGENDA_LINE_HEIGHT = 28;
const AGENDA_HEADER_HEIGHT = 28;
const AGENDA_GAP_TO_URGENCY = 20;
const AGENDA_SEPARATOR_OFFSET = 20;
const AGENDA_SEPARATOR_WIDTH = 420;
const AGENDA_TIME_WIDTH = 52;
const AGENDA_BADGE_PADDING = 8;
const AGENDA_BADGE_HEIGHT = 14;
const AGENDA_BADGE_RADIUS = 3;
const AGENDA_TITLE_GAP = 10;
const AGENDA_MAX_TITLE_WIDTH = 370;

function agendaBadge(source) {
  const badge = AGENDA_BADGES[source] || AGENDA_BADGES[FALLBACK_BADGE_SOURCE];
  return { label: t(badge.key), color: badge.color };
}

function formatAgendaTime(timestamp) {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function drawAgendaHeader(ctx, x, y) {
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.font = '700 13px "Ubuntu", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.letterSpacing = '2px';
  ctx.fillText(t('wallpaper.next_24h'), x, y);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y + AGENDA_SEPARATOR_OFFSET);
  ctx.lineTo(x + AGENDA_SEPARATOR_WIDTH, y + AGENDA_SEPARATOR_OFFSET);
  ctx.stroke();
}

function drawAgendaRow(ctx, ev, x, y) {
  // Prefer start_at for display, fall back to due_at
  ctx.font = '600 12px "Ubuntu Mono", "Consolas", monospace';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
  ctx.fillText(formatAgendaTime(ev.start_at || ev.due_at), x, y);

  const badge = agendaBadge(ev.source);
  const badgeX = x + AGENDA_TIME_WIDTH;
  ctx.fillStyle = badge.color;
  ctx.font = '700 8px "Ubuntu", system-ui, sans-serif';
  const badgeWidth = ctx.measureText(badge.label).width + AGENDA_BADGE_PADDING;
  ctx.beginPath();
  ctx.roundRect(badgeX, y - 1, badgeWidth, AGENDA_BADGE_HEIGHT, AGENDA_BADGE_RADIUS);
  ctx.fill();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.fillText(badge.label, badgeX + AGENDA_BADGE_PADDING / 2, y + 2);

  ctx.font = '400 12px "Ubuntu", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  const titleX = badgeX + badgeWidth + AGENDA_TITLE_GAP;
  ctx.fillText(truncateText(ctx, ev.title, AGENDA_MAX_TITLE_WIDTH), titleX, y);
}

function drawDailyAgenda(ctx, allTasks, region, agendaBottom) {
  const todayEvents = filterUpcomingEvents(allTasks);
  if (todayEvents.length === 0) {
    return;
  }

  const startX = region.x + AGENDA_MARGIN;
  const startY = region.y + AGENDA_MARGIN;
  const availableHeight =
    agendaBottom - AGENDA_BAND_GAP - startY - AGENDA_HEADER_HEIGHT - AGENDA_GAP_TO_URGENCY;
  const maxItems = Math.max(1, Math.floor(availableHeight / AGENDA_LINE_HEIGHT));
  const rowY = (i) => startY + AGENDA_HEADER_HEIGHT + i * AGENDA_LINE_HEIGHT;

  drawAgendaHeader(ctx, startX, startY);
  todayEvents.slice(0, maxItems).forEach((ev, i) => drawAgendaRow(ctx, ev, startX, rowY(i)));

  if (todayEvents.length > maxItems) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.60)';
    ctx.font = '400 11px "Ubuntu", system-ui, sans-serif';
    ctx.fillText(
      t('wallpaper.others', { n: todayEvents.length - maxItems }),
      startX,
      rowY(maxItems),
    );
  }
}

module.exports = { drawDailyAgenda, filterUpcomingEvents, agendaBadge, formatAgendaTime };

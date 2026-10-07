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

function drawDailyAgenda(ctx, allTasks, region, agendaBottom) {
  const todayEvents = filterUpcomingEvents(allTasks);
  if (todayEvents.length === 0) {
    return;
  }

  const margin = 48;
  const startX = region.x + margin;
  const startY = region.y + margin;
  const lineHeight = 28;
  const headerHeight = 28;
  const gapToUrgency = 20;
  const availableHeight = agendaBottom - AGENDA_BAND_GAP - startY - headerHeight - gapToUrgency;
  const maxItems = Math.max(1, Math.floor(availableHeight / lineHeight));

  // Header
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.font = '700 13px "Ubuntu", system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.letterSpacing = '2px';
  ctx.fillText(t('wallpaper.next_24h'), startX, startY);

  // Separator line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.40)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startX, startY + 20);
  ctx.lineTo(startX + 420, startY + 20);
  ctx.stroke();

  const visible = todayEvents.slice(0, maxItems);

  for (let i = 0; i < visible.length; i++) {
    const ev = visible[i];
    const y = startY + 28 + i * lineHeight;

    // Time — prefer start_at for display, fall back to due_at
    const d = new Date(ev.start_at || ev.due_at);
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    ctx.font = '600 12px "Ubuntu Mono", "Consolas", monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
    ctx.fillText(time, startX, y);

    // Source badge
    const badgeX = startX + 52;
    const badgeMap = {
      gcal: { label: t('wallpaper.cal_badge'), color: 'rgba(66, 133, 244, 0.5)' },
      gtasks: { label: t('wallpaper.tasks_badge'), color: 'rgba(52, 168, 83, 0.5)' },
      jira: { label: t('wallpaper.jira_badge'), color: 'rgba(255, 152, 0, 0.5)' },
      outlook: { label: t('wallpaper.outlook_badge'), color: 'rgba(0, 120, 212, 0.5)' },
    };
    const badge = badgeMap[ev.source] || badgeMap.jira;
    const badgeLabel = badge.label;
    const badgeColor = badge.color;

    ctx.fillStyle = badgeColor;
    ctx.font = '700 8px "Ubuntu", system-ui, sans-serif';
    const badgeWidth = ctx.measureText(badgeLabel).width + 8;
    ctx.beginPath();
    ctx.roundRect(badgeX, y - 1, badgeWidth, 14, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.fillText(badgeLabel, badgeX + 4, y + 2);

    // Title
    ctx.font = '400 12px "Ubuntu", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    const titleX = badgeX + badgeWidth + 10;
    const maxTitleWidth = 370;
    ctx.fillText(truncateText(ctx, ev.title, maxTitleWidth), titleX, y);
  }

  if (todayEvents.length > maxItems) {
    const y = startY + 28 + maxItems * lineHeight;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.60)';
    ctx.font = '400 11px "Ubuntu", system-ui, sans-serif';
    ctx.fillText(t('wallpaper.others', { n: todayEvents.length - maxItems }), startX, y);
  }
}

module.exports = { drawDailyAgenda, filterUpcomingEvents };

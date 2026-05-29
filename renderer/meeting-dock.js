'use strict';

/* global t, initI18n */

const container = document.getElementById('meetingContainer');

const VIDEO_ICON_SVG =
  '<svg class="meeting-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
  '<path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 ' +
  '1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>';

let currentMeetings = [];
const dismissedIds = new Set();

function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatCountdown(startAt) {
  const diffMs = startAt - Date.now();
  const diffMin = Math.max(0, Math.round(diffMs / 60000));
  if (diffMin === 0) {
    return t('countdown.now');
  }
  return diffMin + ' min';
}

function render() {
  container.innerHTML = '';

  if (!currentMeetings || currentMeetings.length === 0) {
    dismissedIds.clear();
    window.meetingDockApi.setVisible(false);
    return;
  }

  const currentIds = new Set(currentMeetings.map((m) => m.id));
  for (const id of dismissedIds) {
    if (!currentIds.has(id)) {
      dismissedIds.delete(id);
    }
  }

  const visible = currentMeetings.filter((m) => !dismissedIds.has(m.id));
  if (visible.length === 0) {
    window.meetingDockApi.setVisible(false);
    return;
  }

  window.meetingDockApi.setVisible(true);

  for (const meeting of visible) {
    const box = document.createElement('div');
    box.className = 'meeting-box';
    box.title = meeting.title;

    box.innerHTML =
      VIDEO_ICON_SVG +
      '<span class="meeting-time">' +
      escapeHtml(formatTime(meeting.start_at)) +
      '</span>' +
      '<span class="meeting-title">' +
      escapeHtml(meeting.title) +
      '</span>' +
      '<span class="meeting-countdown">' +
      escapeHtml(formatCountdown(meeting.start_at)) +
      '</span>' +
      '<button class="meeting-dismiss" type="button" aria-label="Dismiss">×</button>';

    box.addEventListener('click', function () {
      window.meetingDockApi.openMeetLink(meeting.meet_url);
    });

    const dismissBtn = box.querySelector('.meeting-dismiss');
    dismissBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      dismissedIds.add(meeting.id);
      render();
    });

    box.addEventListener('mouseenter', function () {
      window.meetingDockApi.setIgnoreMouse(false);
    });

    box.addEventListener('mouseleave', function () {
      window.meetingDockApi.setIgnoreMouse(true);
    });

    container.appendChild(box);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

window.meetingDockApi.onMeetings(function (meetings) {
  currentMeetings = meetings || [];
  render();
});

(async () => {
  await initI18n(window.meetingDockApi);
})();

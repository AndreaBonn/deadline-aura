'use strict';

/* eslint-disable no-unused-vars */
/* global t, _i18nReady */

/**
 * Work shift countdown renderer for the sidebar.
 * Loaded via <script> in index.html, exposes updateShiftCountdown() globally.
 *
 * Requires core/work-shift.js logic replicated as pure functions here
 * (renderer cannot require() Node modules directly).
 */

const SHIFT_MS_PER_SECOND = 1000;
const SHIFT_MS_PER_MINUTE = 60 * SHIFT_MS_PER_SECOND;

const SHIFT_MAX_LOOKAHEAD_DAYS = 60;

let _shiftConfig = null;

function setShiftConfig(cfg) {
  _shiftConfig = cfg;
}

function shiftParseTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function shiftFormatDateKey(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${mo}-${d}`;
}

function shiftFormatMonthKey(date) {
  const y = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${mo}`;
}

function shiftGetSlotsForDate(date, config) {
  if (!config || !config.enabled) {
    return [];
  }
  const dateKey = shiftFormatDateKey(date);
  const dayOfWeek = date.getDay();

  if (config.mode === 'variable') {
    const monthKey = shiftFormatMonthKey(date);
    const monthData = config.variable?.months?.[monthKey];
    if (!monthData) {
      return [];
    }
    const daySlots = monthData[String(date.getDate())];
    if (!daySlots || daySlots.length === 0) {
      return [];
    }
    return daySlots
      .map((s) => ({ start: shiftParseTime(s.start), end: shiftParseTime(s.end) }))
      .sort((a, b) => a.start - b.start);
  }

  const regular = config.regular;
  if (!regular) {
    return [];
  }
  if (regular.holidays?.includes(dateKey)) {
    return [];
  }
  if (!regular.work_days?.includes(dayOfWeek)) {
    return [];
  }
  return regular.slots
    .map((s) => ({ start: shiftParseTime(s.start), end: shiftParseTime(s.end) }))
    .sort((a, b) => a.start - b.start);
}

function shiftFindNextWorkDay(fromDate, config) {
  const candidate = new Date(fromDate);
  candidate.setDate(candidate.getDate() + 1);
  candidate.setHours(0, 0, 0, 0);
  for (let i = 0; i < SHIFT_MAX_LOOKAHEAD_DAYS; i++) {
    if (shiftGetSlotsForDate(candidate, config).length > 0) {
      return new Date(candidate);
    }
    candidate.setDate(candidate.getDate() + 1);
  }
  return null;
}

function shiftFormatRemainingMs(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / SHIFT_MS_PER_SECOND));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Update the shift countdown DOM elements.
 * Called every second from the clock interval.
 */
function updateShiftCountdown() {
  const container = document.getElementById('shiftCountdown');
  const labelEl = document.getElementById('shiftLabel');
  const timeEl = document.getElementById('shiftTime');

  if (!container || !labelEl || !timeEl) {
    return;
  }

  if (!_shiftConfig || !_shiftConfig.enabled) {
    container.style.display = 'none';
    return;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentMs =
    now.getHours() * 3600000 + now.getMinutes() * 60000 + now.getSeconds() * 1000;

  const todaySlots = shiftGetSlotsForDate(now, _shiftConfig);

  let working = false;
  let remainingMs = 0;
  let label = 'off';

  if (todaySlots.length > 0) {
    for (const slot of todaySlots) {
      if (currentMinutes >= slot.start && currentMinutes < slot.end) {
        working = true;
        remainingMs = slot.end * SHIFT_MS_PER_MINUTE - currentMs;
        label = 'shift_ends';
        break;
      }
    }

    if (!working) {
      for (const slot of todaySlots) {
        if (currentMinutes < slot.start) {
          remainingMs = slot.start * SHIFT_MS_PER_MINUTE - currentMs;
          label = 'shift_starts';
          break;
        }
      }
    }
  }

  if (!working && label === 'off') {
    const nextDay = shiftFindNextWorkDay(now, _shiftConfig);
    if (nextDay) {
      const nextSlots = shiftGetSlotsForDate(nextDay, _shiftConfig);
      if (nextSlots.length > 0) {
        const nextStart = nextSlots[0].start;
        const nextDayStart = new Date(nextDay);
        nextDayStart.setHours(Math.floor(nextStart / 60), nextStart % 60, 0, 0);
        remainingMs = Math.max(0, nextDayStart.getTime() - now.getTime());
        label = 'shift_starts';
      }
    }
  }

  container.style.display = 'flex';
  container.className = `shift-countdown ${working ? 'working' : 'off'}`;

  if (label === 'off' || remainingMs <= 0) {
    labelEl.textContent = _i18nReady ? t('sidebar.shift_off') : 'Off';
    timeEl.textContent = '--:--';
  } else {
    const labelKey = label === 'shift_ends' ? 'sidebar.shift_ends' : 'sidebar.shift_starts';
    labelEl.textContent = _i18nReady ? t(labelKey) : label;
    timeEl.textContent = shiftFormatRemainingMs(remainingMs);
  }
}

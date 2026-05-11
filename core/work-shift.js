'use strict';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;

/**
 * Parse "HH:MM" string to minutes since midnight.
 *
 * @param {string} timeStr - Format "HH:MM"
 * @returns {number} Minutes since midnight
 */
function parseTime(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Format milliseconds remaining as HH:MM:SS.
 *
 * @param {number} ms - Milliseconds remaining
 * @returns {string} Formatted string "HH:MM:SS" or "MM:SS" if < 1h
 */
function formatRemainingMs(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / MS_PER_SECOND));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * Remove holidays that are in the past relative to today.
 *
 * @param {string[]} holidays - Array of "YYYY-MM-DD" strings
 * @param {Date} [now] - Reference date (default: new Date())
 * @returns {string[]} Filtered holidays (today and future only)
 */
function cleanupPastHolidays(holidays, now) {
  const ref = now || new Date();
  const todayStr = formatDateKey(ref);
  return holidays.filter((d) => d >= todayStr);
}

/**
 * Format a Date as "YYYY-MM-DD".
 *
 * @param {Date} date
 * @returns {string}
 */
function formatDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format a Date as "YYYY-MM".
 *
 * @param {Date} date
 * @returns {string}
 */
function formatMonthKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Get work slots for a specific date given the work_shift config.
 * Returns sorted array of {start, end} in minutes since midnight.
 * Returns empty array if not a work day.
 *
 * @param {Date} date - The date to check
 * @param {object} config - work_shift config object
 * @returns {Array<{start: number, end: number}>} Sorted slots in minutes
 */
function getSlotsForDate(date, config) {
  if (!config || !config.enabled) {
    return [];
  }

  const dateKey = formatDateKey(date);
  const dayOfWeek = date.getDay();

  if (config.mode === 'variable') {
    const monthKey = formatMonthKey(date);
    const monthData = config.variable?.months?.[monthKey];
    if (!monthData) {
      return [];
    }
    const dayNum = String(date.getDate());
    const daySlots = monthData[dayNum];
    if (!daySlots || daySlots.length === 0) {
      return [];
    }
    return daySlots
      .map((s) => ({ start: parseTime(s.start), end: parseTime(s.end) }))
      .sort((a, b) => a.start - b.start);
  }

  const regular = config.regular;
  if (!regular) {
    return [];
  }

  const isHoliday = regular.holidays?.includes(dateKey);
  if (isHoliday) {
    return [];
  }

  const isWorkDay = regular.work_days?.includes(dayOfWeek);
  if (!isWorkDay) {
    return [];
  }

  return regular.slots
    .map((s) => ({ start: parseTime(s.start), end: parseTime(s.end) }))
    .sort((a, b) => a.start - b.start);
}

/**
 * Compute the current work shift status.
 *
 * @param {object} config - work_shift config object
 * @param {Date} [now] - Reference time (default: new Date())
 * @returns {{
 *   enabled: boolean,
 *   working: boolean,
 *   remainingMs: number,
 *   formatted: string,
 *   label: 'shift_ends'|'shift_starts'|'off'
 * }}
 */
function getShiftStatus(config, now) {
  const disabled = { enabled: false, working: false, remainingMs: 0, formatted: '', label: 'off' };

  if (!config || !config.enabled) {
    return disabled;
  }

  const ref = now || new Date();
  const currentMinutes = ref.getHours() * 60 + ref.getMinutes();
  const currentMs = ref.getHours() * 3600000 + ref.getMinutes() * 60000 + ref.getSeconds() * 1000;

  const todaySlots = getSlotsForDate(ref, config);

  if (todaySlots.length > 0) {
    for (const slot of todaySlots) {
      if (currentMinutes >= slot.start && currentMinutes < slot.end) {
        const endMs = slot.end * MS_PER_MINUTE;
        const remaining = endMs - currentMs;
        return {
          enabled: true,
          working: true,
          remainingMs: remaining,
          formatted: formatRemainingMs(remaining),
          label: 'shift_ends',
        };
      }
    }

    for (const slot of todaySlots) {
      if (currentMinutes < slot.start) {
        const startMs = slot.start * MS_PER_MINUTE;
        const remaining = startMs - currentMs;
        return {
          enabled: true,
          working: false,
          remainingMs: remaining,
          formatted: formatRemainingMs(remaining),
          label: 'shift_starts',
        };
      }
    }
  }

  const nextWorkDay = findNextWorkDay(ref, config);
  if (!nextWorkDay) {
    return { enabled: true, working: false, remainingMs: 0, formatted: '--:--', label: 'off' };
  }

  const nextSlots = getSlotsForDate(nextWorkDay, config);
  if (nextSlots.length === 0) {
    return { enabled: true, working: false, remainingMs: 0, formatted: '--:--', label: 'off' };
  }

  const nextStart = nextSlots[0].start;
  const nextDayStart = new Date(nextWorkDay);
  nextDayStart.setHours(Math.floor(nextStart / 60), nextStart % 60, 0, 0);
  const remaining = nextDayStart.getTime() - ref.getTime();

  return {
    enabled: true,
    working: false,
    remainingMs: Math.max(0, remaining),
    formatted: formatRemainingMs(Math.max(0, remaining)),
    label: 'shift_starts',
  };
}

/**
 * Find the next work day after the given date (checks up to 60 days ahead).
 *
 * @param {Date} fromDate - Starting date
 * @param {object} config - work_shift config
 * @returns {Date|null} Next work day or null if none found within 60 days
 */
function findNextWorkDay(fromDate, config) {
  const MAX_LOOKAHEAD_DAYS = 60;
  const candidate = new Date(fromDate);
  candidate.setDate(candidate.getDate() + 1);
  candidate.setHours(0, 0, 0, 0);

  for (let i = 0; i < MAX_LOOKAHEAD_DAYS; i++) {
    const slots = getSlotsForDate(candidate, config);
    if (slots.length > 0) {
      return new Date(candidate);
    }
    candidate.setDate(candidate.getDate() + 1);
  }

  return null;
}

/**
 * Remove expired months from variable shift config.
 * Keeps current month and future months only.
 *
 * @param {object} months - The variable.months object
 * @param {Date} [now] - Reference date
 * @returns {object} Cleaned months object
 */
function cleanupExpiredMonths(months, now) {
  const ref = now || new Date();
  const currentMonthKey = formatMonthKey(ref);
  const cleaned = {};
  for (const key of Object.keys(months)) {
    if (key >= currentMonthKey) {
      cleaned[key] = months[key];
    }
  }
  return cleaned;
}

module.exports = {
  parseTime,
  formatRemainingMs,
  cleanupPastHolidays,
  formatDateKey,
  formatMonthKey,
  getSlotsForDate,
  getShiftStatus,
  findNextWorkDay,
  cleanupExpiredMonths,
};

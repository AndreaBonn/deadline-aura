'use strict';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const COUNTDOWN_STEP_MS = 15 * MS_PER_MINUTE;
const COUNTDOWN_DAY_THRESHOLD_MS = MS_PER_DAY;

const STALE_AFTER_MS = 30 * MS_PER_MINUTE;

const PCT_MIN = 0;
const PCT_MAX = 100;

const WEEKDAY_LABELS = {
  it: ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const DAY_UNIT_LABELS = {
  it: 'g',
  en: 'd',
};

/**
 * Clamp a percentage value into the 0-100 range.
 *
 * @param {number} pct - Raw percentage value.
 * @returns {number} Clamped percentage.
 */
function clampPct(pct) {
  return Math.min(PCT_MAX, Math.max(PCT_MIN, pct));
}

/**
 * Normalize a raw usage window against the current time.
 * A window whose reset is already in the past is reported as fully
 * recovered (0%) and marked as inferred/expired, since the real
 * percentage after the reset is unknown until a fresh capture arrives.
 *
 * @param {{pct: number, resetsAt: number}|null} win - Raw window, resetsAt in epoch seconds.
 * @param {number} nowMs - Current time in epoch milliseconds.
 * @returns {{pct: number, resetsAt: number, inferred: boolean, expired: boolean}|null}
 */
function normalizeWindow(win, nowMs) {
  if (win === null || win === undefined) {
    return null;
  }

  const resetsAtMs = win.resetsAt * MS_PER_SECOND;
  const expired = resetsAtMs <= nowMs;

  if (expired) {
    return { pct: 0, resetsAt: win.resetsAt, inferred: true, expired: true };
  }

  return { pct: clampPct(win.pct), resetsAt: win.resetsAt, inferred: false, expired: false };
}

/**
 * Round a millisecond delta down to a fixed step.
 *
 * @param {number} deltaMs - Non-negative delta in milliseconds.
 * @param {number} stepMs - Step size in milliseconds.
 * @returns {number} Delta floored to the step.
 */
function floorToStep(deltaMs, stepMs) {
  return Math.floor(deltaMs / stepMs) * stepMs;
}

/**
 * Format the countdown to a reset as a short, step-rounded string.
 * Below 24h, rounds down to 15-minute steps (D1); at or above 24h,
 * rounds down to the hour and shows day+hour.
 *
 * @param {number} resetsAtS - Reset time, epoch seconds.
 * @param {number} nowMs - Current time, epoch milliseconds.
 * @param {'it'|'en'} lang - Language for the day unit.
 * @returns {string} Countdown string, or '' if the reset already passed.
 */
function formatCountdown(resetsAtS, nowMs, lang) {
  const deltaMs = resetsAtS * MS_PER_SECOND - nowMs;
  if (deltaMs <= 0) {
    return '';
  }

  if (deltaMs < COUNTDOWN_DAY_THRESHOLD_MS) {
    const flooredMs = floorToStep(deltaMs, COUNTDOWN_STEP_MS);
    if (flooredMs < COUNTDOWN_STEP_MS) {
      return '<15m';
    }
    const hours = Math.floor(flooredMs / MS_PER_HOUR);
    const minutes = Math.floor((flooredMs % MS_PER_HOUR) / MS_PER_MINUTE);
    return hours > 0 ? `~${hours}h ${minutes}m` : `~${minutes}m`;
  }

  const flooredMs = floorToStep(deltaMs, MS_PER_HOUR);
  const days = Math.floor(flooredMs / MS_PER_DAY);
  const hours = Math.floor((flooredMs % MS_PER_DAY) / MS_PER_HOUR);
  return `${days}${DAY_UNIT_LABELS[lang]} ${hours}h`;
}

const EN_WEEKDAY_ORDER = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Check whether two instants fall on the same local calendar day.
 *
 * @param {Date} a - First instant.
 * @param {Date} b - Second instant.
 * @param {string|undefined} timeZone - Optional IANA time zone override.
 * @returns {boolean}
 */
function isSameLocalDay(a, b, timeZone) {
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return dayFormatter.format(a) === dayFormatter.format(b);
}

/**
 * Resolve the localized abbreviated weekday label for a date.
 *
 * @param {Date} date - The date to label.
 * @param {'it'|'en'} lang - Language for the label.
 * @param {string|undefined} timeZone - Optional IANA time zone override.
 * @returns {string} e.g. 'ven' or 'Fri'.
 */
function weekdayLabel(date, lang, timeZone) {
  const weekdayFormatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
  const weekdayName = weekdayFormatter.formatToParts(date).find((p) => p.type === 'weekday').value;
  const weekdayIndex = EN_WEEKDAY_ORDER.indexOf(weekdayName);
  return WEEKDAY_LABELS[lang][weekdayIndex];
}

/**
 * Format the reset instant as a clock time, prefixed with the
 * abbreviated weekday when it falls on a different local day than now.
 *
 * @param {number} resetsAtS - Reset time, epoch seconds.
 * @param {number} nowMs - Current time, epoch milliseconds.
 * @param {'it'|'en'} lang - Language for the weekday label.
 * @param {{timeZone?: string}} [options] - Optional IANA time zone override (for tests).
 * @returns {string} e.g. '14:30' or 'ven 09:00'.
 */
function formatResetAt(resetsAtS, nowMs, lang, options) {
  const timeZone = options?.timeZone;
  const resetDate = new Date(resetsAtS * MS_PER_SECOND);
  const nowDate = new Date(nowMs);

  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const clock = timeFormatter.format(resetDate);

  if (isSameLocalDay(resetDate, nowDate, timeZone)) {
    return clock;
  }

  return `${weekdayLabel(resetDate, lang, timeZone)} ${clock}`;
}

/**
 * Format the full reset display: clock/weekday time plus the
 * parenthesized countdown (D1), e.g. '14:30 (~2h 15m)'.
 *
 * @param {number} resetsAtS - Reset time, epoch seconds.
 * @param {number} nowMs - Current time, epoch milliseconds.
 * @param {'it'|'en'} lang - Language.
 * @param {{timeZone?: string}} [options] - Optional IANA time zone override (for tests).
 * @returns {string} e.g. '14:30 (~2h 15m)' or 'ven 09:00 (3g 4h)'.
 */
function formatReset(resetsAtS, nowMs, lang, options) {
  const resetAt = formatResetAt(resetsAtS, nowMs, lang, options);
  const countdown = formatCountdown(resetsAtS, nowMs, lang);
  return `${resetAt} (${countdown})`;
}

/**
 * Bucket identifier for the countdown text, stable within the same
 * rounding step and changing only when the displayed text would change.
 * Used as part of the render signature (ADR-2) to avoid redundant redraws.
 *
 * @param {number} resetsAtS - Reset time, epoch seconds.
 * @param {number} nowMs - Current time, epoch milliseconds.
 * @returns {number} Integer bucket id.
 */
function countdownBucket(resetsAtS, nowMs) {
  const deltaMs = resetsAtS * MS_PER_SECOND - nowMs;
  if (deltaMs <= 0) {
    return 0;
  }
  const stepMs = deltaMs < COUNTDOWN_DAY_THRESHOLD_MS ? COUNTDOWN_STEP_MS : MS_PER_HOUR;
  return Math.floor(deltaMs / stepMs);
}

/**
 * Check whether a captured snapshot is older than the staleness threshold.
 * A capture timestamp in the future (clock skew) is never stale.
 *
 * @param {number} capturedAtS - Capture time, epoch seconds.
 * @param {number} nowMs - Current time, epoch milliseconds.
 * @param {number} staleAfterMs - Staleness threshold in milliseconds.
 * @returns {boolean}
 */
function isStale(capturedAtS, nowMs, staleAfterMs) {
  const ageMs = nowMs - capturedAtS * MS_PER_SECOND;
  if (ageMs < 0) {
    return false;
  }
  return ageMs >= staleAfterMs;
}

module.exports = {
  normalizeWindow,
  formatCountdown,
  formatResetAt,
  formatReset,
  countdownBucket,
  isStale,
  STALE_AFTER_MS,
};

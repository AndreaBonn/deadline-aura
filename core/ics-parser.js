'use strict';

const ICAL = require('ical.js');

// Emitted occurrences per series. A published corporate calendar can carry
// series with no UNTIL, and the caller only ever renders a handful of them.
const DEFAULT_MAX_INSTANCES_PER_SERIES = 500;

// Hard stop on iterations, independent of how many occurrences land inside the
// window. Outlook publishes series that started years ago, so the iterator has
// to walk from the original DTSTART before it reaches today; without this an
// endless RRULE that begins in the past would spin forever. Set high enough
// that even an hourly series running for a decade reaches the window before the
// cap: hitting it early would drop real occurrences, not just excess ones.
const MAX_ITERATIONS_PER_SERIES = 100000;

// Titles a feed published as "availability only" uses in place of the real
// subject. Lowercase; matching is case-insensitive.
const TITLE_PLACEHOLDERS = ['busy', 'occupato', 'tentative', 'provvisorio', 'private', 'privato'];

// Above this share of placeholder titles the feed is almost certainly published
// without details, which silently defeats keyword priorities and AI scoring.
const PLACEHOLDER_WARNING_RATIO = 0.8;

const MEETING_URL_PATTERN =
  /https?:\/\/(?:teams\.microsoft\.com\/[\w./?=&%-]+|[\w.-]+\.zoom\.us\/j\/[\w?=&-]+|meet\.google\.com\/[\w-]+)/i;

/**
 * Register every VTIMEZONE carried by the feed so ICAL.Time can resolve TZIDs.
 *
 * @param {ICAL.Component} calendar - Root VCALENDAR component.
 */
function registerTimezones(calendar) {
  for (const vtimezone of calendar.getAllSubcomponents('vtimezone')) {
    const timezone = new ICAL.Timezone(vtimezone);
    if (timezone.tzid && !ICAL.TimezoneService.has(timezone.tzid)) {
      ICAL.TimezoneService.register(timezone.tzid, timezone);
    }
  }
}

function extractJoinUrl(event) {
  const teamsProperty = event.component.getFirstPropertyValue('x-microsoft-skypeteamsmeetingurl');
  if (teamsProperty) {
    return String(teamsProperty);
  }

  for (const text of [event.description, event.location]) {
    const match = typeof text === 'string' ? text.match(MEETING_URL_PATTERN) : null;
    if (match) {
      return match[0];
    }
  }
  return null;
}

function extractCategories(event) {
  const property = event.component.getFirstProperty('categories');
  return property ? property.getValues().map(String) : [];
}

function isCancelled(event) {
  const status = event.component.getFirstPropertyValue('status');
  return typeof status === 'string' && status.toUpperCase() === 'CANCELLED';
}

/**
 * Build the domain-level occurrence handed back to callers.
 *
 * Times are epoch milliseconds so the caller never has to know about ICAL.Time.
 *
 * @param {ICAL.Event} event - Event carrying the descriptive fields.
 * @param {ICAL.Time} startTime - Occurrence start.
 * @param {ICAL.Time} endTime - Occurrence end.
 * @returns {object} Parsed occurrence.
 */
function toOccurrence(event, startTime, endTime) {
  const priority = event.component.getFirstPropertyValue('priority');
  const importance = event.component.getFirstPropertyValue('x-microsoft-cdo-importance');

  return {
    uid: event.uid,
    title: event.summary || '',
    description: event.description || '',
    location: event.location || '',
    start: startTime.toJSDate().getTime(),
    end: endTime.toJSDate().getTime(),
    // Calendar representation of the start, straight from the document. Unlike
    // `start`, it does not depend on the machine's time zone: an all-day or
    // floating event resolves through the local zone in toJSDate(), so an epoch
    // is not a stable identity for one.
    startKey: startTime.toString(),
    allDay: Boolean(startTime.isDate),
    organizer: event.organizer || null,
    attendeesCount: Array.isArray(event.attendees) ? event.attendees.length : 0,
    categories: extractCategories(event),
    priorityRaw: priority === null || priority === undefined ? null : Number(priority),
    importanceRaw: importance === null || importance === undefined ? null : Number(importance),
    joinUrl: extractJoinUrl(event),
  };
}

function expandRecurring(event, options, warnings) {
  const { windowStart, windowEnd, maxInstancesPerSeries } = options;
  const iterator = event.iterator();
  const occurrences = [];
  let iterations = 0;
  let next;

  while ((next = iterator.next())) {
    iterations += 1;
    if (iterations > MAX_ITERATIONS_PER_SERIES) {
      warnings.push(`series ${event.uid} exceeded the iteration limit and was truncated`);
      break;
    }
    if (next.toJSDate().getTime() > windowEnd) {
      break;
    }
    if (occurrences.length >= maxInstancesPerSeries) {
      warnings.push(`series ${event.uid} exceeded ${maxInstancesPerSeries} occurrences`);
      break;
    }

    const details = event.getOccurrenceDetails(next);
    if (isCancelled(details.item)) {
      continue;
    }
    const occurrence = toOccurrence(details.item, details.startDate, details.endDate);
    // Checked again on the resolved occurrence, not only on the RRULE slot
    // above: a RECURRENCE-ID exception can move an instance outside the window
    // the original slot fell into, in either direction.
    if (occurrence.end < windowStart || occurrence.start > windowEnd) {
      continue;
    }
    occurrences.push(occurrence);
  }

  return occurrences;
}

function collectSingle(event, options) {
  const { windowStart, windowEnd } = options;
  const occurrence = toOccurrence(event, event.startDate, event.endDate);

  if (occurrence.start > windowEnd || occurrence.end < windowStart) {
    return [];
  }
  return [occurrence];
}

function splitComponents(vevents, warnings) {
  const masters = [];
  const exceptions = [];

  for (const vevent of vevents) {
    let event;
    try {
      event = new ICAL.Event(vevent);
      if (!event.startDate) {
        throw new Error('missing DTSTART');
      }
    } catch (err) {
      const uid = vevent.getFirstPropertyValue('uid') || 'unknown';
      warnings.push(`skipped event ${uid}: ${err.message}`);
      continue;
    }

    if (vevent.hasProperty('recurrence-id')) {
      exceptions.push(event);
    } else {
      masters.push(event);
    }
  }

  return { masters, exceptions };
}

function attachExceptions(masters, exceptions, warnings) {
  const byUid = new Map(masters.map((master) => [master.uid, master]));

  for (const exception of exceptions) {
    const master = byUid.get(exception.uid);
    if (!master) {
      warnings.push(`orphan exception for ${exception.uid}: no master event in the feed`);
      continue;
    }
    try {
      master.relateException(exception);
    } catch (err) {
      warnings.push(`could not attach exception for ${exception.uid}: ${err.message}`);
    }
  }
}

function warnOnPlaceholderTitles(occurrences, warnings) {
  if (occurrences.length === 0) {
    return;
  }

  const placeholders = occurrences.filter((occurrence) =>
    TITLE_PLACEHOLDERS.includes(occurrence.title.trim().toLowerCase()),
  );

  if (placeholders.length / occurrences.length >= PLACEHOLDER_WARNING_RATIO) {
    warnings.push(
      'the feed looks published as free/busy only: event titles carry no subject, ' +
        'so keyword priorities and AI scoring cannot work. Republish it with full details.',
    );
  }
}

/**
 * Parse an iCalendar document into occurrences inside a time window.
 *
 * Pure: performs no I/O and knows nothing about the application record shape.
 * A partially unreadable feed yields the events it could read plus warnings,
 * never a throw — only input that is not iCalendar at all is fatal.
 *
 * @param {string} icsText - Raw iCalendar document.
 * @param {object} options - Parse options.
 * @param {number} options.windowStart - Epoch ms; occurrences ending before it are dropped.
 * @param {number} options.windowEnd - Epoch ms; occurrences starting after it are dropped.
 * @param {number} [options.maxInstancesPerSeries] - Emitted occurrence cap per series.
 * @returns {{events: object[], warnings: string[]}} Parsed occurrences and non-fatal problems.
 * @throws {Error} When the input cannot be parsed as iCalendar.
 */
function parseIcs(icsText, options) {
  const { maxInstancesPerSeries = DEFAULT_MAX_INSTANCES_PER_SERIES } = options;
  const parseOptions = { ...options, maxInstancesPerSeries };
  const warnings = [];

  let jcal;
  try {
    jcal = ICAL.parse(icsText);
  } catch (err) {
    throw new Error(`not a valid iCalendar document: ${err.message}`);
  }

  const calendar = new ICAL.Component(jcal);
  registerTimezones(calendar);

  const { masters, exceptions } = splitComponents(calendar.getAllSubcomponents('vevent'), warnings);
  attachExceptions(masters, exceptions, warnings);

  const events = [];
  for (const master of masters) {
    if (isCancelled(master) && !master.isRecurring()) {
      continue;
    }
    const occurrences = master.isRecurring()
      ? expandRecurring(master, parseOptions, warnings)
      : collectSingle(master, parseOptions);
    events.push(...occurrences);
  }

  warnOnPlaceholderTitles(events, warnings);

  return { events, warnings };
}

module.exports = { parseIcs, TITLE_PLACEHOLDERS, MEETING_URL_PATTERN };

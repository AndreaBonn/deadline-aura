'use strict';

const crypto = require('crypto');

const { parseIcs } = require('../core/ics-parser');
const { isPrivateHost } = require('../core/url-safety');
const { getLookaheadEnd } = require('../core/deadline-engine');

const FETCH_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 3;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const ID_HASH_LENGTH = 12;

// RFC 5545 maps 1-4 to high, 5 to normal, 6-9 to low. X-MICROSOFT-CDO-IMPORTANCE
// is Outlook's own scale where 2 is high.
const RFC_HIGH_PRIORITY_MAX = 4;
const OUTLOOK_HIGH_IMPORTANCE = 2;

const PRIORITY_HIGH = 1;
const PRIORITY_KEYWORD = 2;
const PRIORITY_DEFAULT = 3;

/**
 * Validate and normalize a feed url before it is fetched.
 *
 * @param {string} rawUrl - Url as configured by the user, or a redirect target.
 * @returns {string} Normalized https url.
 * @throws {Error} When the url is malformed, not https, or points somewhere private.
 */
function validateFeedUrl(rawUrl) {
  const candidate = String(rawUrl || '').trim();
  // Outlook offers the subscription link as webcal://, which is https in disguise.
  const normalized = candidate.replace(/^webcal:\/\//i, 'https://');

  let url;
  try {
    url = new URL(normalized);
  } catch {
    throw new Error('the calendar feed url is not a valid url');
  }

  if (url.protocol !== 'https:') {
    throw new Error('the calendar feed url must use https');
  }

  // The feed url is pasted by the user, who may well be pasting something they
  // received from someone else, so a link pointing at a service on their own
  // machine or LAN is worth refusing. This is a literal-address check, not a DNS
  // resolution: a hostname that resolves to a private address still gets
  // through, which is an accepted limit for a single-user desktop app.
  if (isPrivateHost(url.hostname)) {
    throw new Error('the calendar feed url points at a private or loopback address');
  }

  return url.toString();
}

async function readCappedBody(response, maxBytes) {
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`the calendar feed is too large (over ${maxBytes} bytes)`);
    }
    chunks.push(value);
  }

  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Download the feed, following redirects only through the same validation the
 * configured url went through.
 *
 * No retry on failure, unlike the Jira integration: this is a static file and
 * the sync daemon comes back every few minutes, long before the feed itself is
 * refreshed upstream. Retrying here would only stack requests on an outage.
 *
 * @param {string} url - Validated feed url.
 * @param {object} [options] - Fetch options.
 * @param {number} [options.maxBytes] - Response size cap.
 * @returns {Promise<string>} Raw iCalendar document.
 */
async function fetchFeed(url, options = {}) {
  const { maxBytes = MAX_FEED_BYTES } = options;
  let target = validateFeedUrl(url);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await fetch(target, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: 'text/calendar, text/plain' },
      cache: 'no-store',
    });

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      target = validateFeedUrl(new URL(location, target).toString());
      continue;
    }

    if (!response.ok) {
      throw new Error(`the calendar feed responded ${response.status}`);
    }

    return readCappedBody(response, maxBytes);
  }

  throw new Error(`the calendar feed exceeded ${MAX_REDIRECTS} redirects`);
}

/**
 * Map an occurrence onto a task priority.
 *
 * @param {object} occurrence - Parsed occurrence.
 * @param {string[]} priorityKeywords - Keywords promoting an event.
 * @returns {number} Priority between 1 and 4.
 */
function assignPriority(occurrence, priorityKeywords) {
  const { priorityRaw, importanceRaw } = occurrence;

  if (priorityRaw >= 1 && priorityRaw <= RFC_HIGH_PRIORITY_MAX) {
    return PRIORITY_HIGH;
  }
  if (importanceRaw === OUTLOOK_HIGH_IMPORTANCE) {
    return PRIORITY_HIGH;
  }

  const haystack = [occurrence.title, occurrence.description, ...(occurrence.categories || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const keyword of priorityKeywords || []) {
    if (haystack.includes(keyword.toLowerCase())) {
      return PRIORITY_KEYWORD;
    }
  }

  return PRIORITY_DEFAULT;
}

/**
 * Build the id of an occurrence.
 *
 * The UID alone would collide across every instance of a recurring series, so
 * the start is part of the key. The UID is hashed because Outlook's are
 * hundreds of characters long and this value ends up in database keys and in
 * the renderer.
 *
 * The start comes from the calendar representation, not from an epoch: an
 * all-day or floating event has no zone of its own and resolves through the
 * machine's, so an epoch key would change the id of every all-day event as soon
 * as the system time zone changes, dropping and reinserting the rows and losing
 * the AI scores attached to them.
 *
 * @param {string} uid - Event UID.
 * @param {string} startKey - Occurrence start as written in the calendar.
 * @returns {string} Stable task id.
 */
function buildTaskId(uid, startKey) {
  const digest = crypto
    .createHash('sha256')
    .update(String(uid))
    .digest('hex')
    .slice(0, ID_HASH_LENGTH);
  const slot = String(startKey).replace(/[^0-9TZ]/gi, '');
  return `outlook_${digest}_${slot}`;
}

/**
 * Map a parsed occurrence onto the application task record.
 *
 * @param {object} occurrence - Occurrence from the ICS parser.
 * @param {string[]} priorityKeywords - Keywords promoting an event.
 * @returns {object} Task record ready for the store.
 */
function normalizeOccurrence(occurrence, priorityKeywords) {
  return {
    id: buildTaskId(occurrence.uid, occurrence.startKey || occurrence.start),
    source: 'outlook',
    title: occurrence.title || '(no title)',
    start_at: occurrence.start,
    due_at: occurrence.end,
    all_day: occurrence.allDay,
    priority: assignPriority(occurrence, priorityKeywords),
    is_done: 0,
    // A published feed has no per-event web page to link to, and the feed url
    // itself is a secret that must not reach the renderer.
    web_url: null,
    meet_url: occurrence.joinUrl,
    raw_json: JSON.stringify({
      uid: occurrence.uid,
      title: occurrence.title,
      location: occurrence.location,
      allDay: occurrence.allDay,
      organizer: occurrence.organizer,
      attendeesCount: occurrence.attendeesCount,
      categories: occurrence.categories,
    }),
    synced_at: Date.now(),
  };
}

function hostOf(url) {
  try {
    return new URL(String(url).replace(/^webcal:\/\//i, 'https://')).hostname;
  } catch {
    return 'unknown host';
  }
}

/**
 * Fetch and normalize the events published on the configured Outlook feed.
 *
 * @param {object} config - Application config.
 * @returns {Promise<object[]>} Task records, empty when the source is off.
 */
async function fetchEvents(config) {
  const outlookConfig = config.sources?.outlook;

  if (!outlookConfig?.enabled || !outlookConfig.ics_url) {
    return [];
  }

  try {
    const icsText = await fetchFeed(outlookConfig.ics_url);
    const { events, warnings } = parseIcs(icsText, {
      windowStart: Date.now(),
      windowEnd: getLookaheadEnd().getTime(),
    });

    for (const warning of warnings) {
      console.warn(`Outlook: ${warning}`);
    }

    return events.map((event) => normalizeOccurrence(event, outlookConfig.priority_keywords));
  } catch (err) {
    // The url is a bearer secret: log where it pointed, never the url itself.
    console.error(`Outlook [${hostOf(outlookConfig.ics_url)}]: ${err.message}`);
    throw err;
  }
}

module.exports = {
  fetchEvents,
  fetchFeed,
  normalizeOccurrence,
  assignPriority,
  buildTaskId,
  validateFeedUrl,
};

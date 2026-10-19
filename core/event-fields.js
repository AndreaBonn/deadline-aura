'use strict';

const MEETING_URL_PATTERN =
  /https?:\/\/(?:teams\.microsoft\.com\/[\w./?=&%-]+|[\w.-]+\.zoom\.us\/j\/[\w?=&-]+|meet\.google\.com\/[\w-]+)/i;

function extractMeetUrlFromText(text) {
  if (!text) {
    return null;
  }
  const match = text.match(MEETING_URL_PATTERN);
  return match ? match[0] : null;
}

function extractMeetUrl(event) {
  if (event.hangoutLink) {
    return event.hangoutLink;
  }
  const entryPoints = event.conferenceData?.entryPoints;
  if (Array.isArray(entryPoints)) {
    const videoEntry = entryPoints.find((ep) => ep.entryPointType === 'video' && ep.uri);
    if (videoEntry) {
      return videoEntry.uri;
    }
  }
  return extractMeetUrlFromText(event.description) || extractMeetUrlFromText(event.location);
}

/**
 * Converts a Google Calendar start/end object to epoch milliseconds.
 *
 * @param {{dateTime?: string, date?: string}|null|undefined} boundary - Event start or end.
 * @returns {number|null} dateTime as instant, all-day date as local midnight, null when absent.
 */
function eventBoundaryMs(boundary) {
  if (boundary?.dateTime) {
    return new Date(boundary.dateTime).getTime();
  }
  if (boundary?.date) {
    return new Date(boundary.date + 'T00:00:00').getTime();
  }
  return null;
}

module.exports = { eventBoundaryMs, extractMeetUrl, extractMeetUrlFromText };

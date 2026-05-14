'use strict';

function buildMeetUrlWithAccount(meetUrl, googleAccount) {
  if (!googleAccount) {
    return meetUrl;
  }

  try {
    const parsed = new URL(meetUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === 'meet.google.com' || host === 'hangouts.google.com') {
      parsed.searchParams.set('authuser', googleAccount);
      return parsed.toString();
    }
  } catch {
    // invalid URL — return as-is
  }
  return meetUrl;
}

module.exports = { buildMeetUrlWithAccount };

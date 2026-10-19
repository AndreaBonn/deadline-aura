'use strict';

const { isSafeExternalUrl } = require('./url-safety');

const BROWSERS = ['firefox', 'google-chrome', 'chromium-browser', 'chromium'];
const SPAWN_OPTIONS = { detached: true, stdio: 'ignore' };

function openExternalUrl(url, { which, spawnDetached }) {
  if (typeof url !== 'string' || !isSafeExternalUrl(url)) {
    return;
  }
  for (const browser of BROWSERS) {
    try {
      which(browser);
      spawnDetached(browser, [url], SPAWN_OPTIONS).unref();
      return;
    } catch {
      // Preserve retry after synchronous lookup, spawn or unref failures.
    }
  }
  spawnDetached('xdg-open', [url], SPAWN_OPTIONS).unref();
}

module.exports = { openExternalUrl };

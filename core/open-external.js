'use strict';

const { isSafeExternalUrl } = require('./url-safety');

const BROWSERS = ['firefox', 'google-chrome', 'chromium-browser', 'chromium'];
const FALLBACK_OPENER = 'xdg-open';
const SPAWN_OPTIONS = { detached: true, stdio: 'ignore' };

function launch(spawnDetached, binary, url) {
  const child = spawnDetached(binary, [url], SPAWN_OPTIONS);
  // A missing binary surfaces as an asynchronous 'error' event; unhandled, it
  // would crash the Electron main process.
  child.on('error', (err) => {
    console.error(`[open-external] ${binary} failed: ${err.message}`);
  });
  child.unref();
}

function openExternalUrl(url, { which, spawnDetached }) {
  if (typeof url !== 'string' || !isSafeExternalUrl(url)) {
    return;
  }
  for (const browser of BROWSERS) {
    try {
      which(browser);
      launch(spawnDetached, browser, url);
      return;
    } catch {
      // Preserve retry after synchronous lookup, spawn or unref failures.
    }
  }
  try {
    launch(spawnDetached, FALLBACK_OPENER, url);
  } catch (err) {
    console.error(`[open-external] ${FALLBACK_OPENER} failed: ${err.message}`);
  }
}

module.exports = { openExternalUrl };

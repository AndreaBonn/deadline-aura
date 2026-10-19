'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Path of the marker written once the first-run guidance has been shown.
 *
 * @param {string} home - User home directory.
 * @returns {string} `<home>/.local/share/deadlineaura/onboarding-done`.
 */
function onboardingMarkerPath(home) {
  return path.join(home, '.local', 'share', 'deadlineaura', 'onboarding-done');
}

/**
 * Whether this is the first launch, i.e. the onboarding marker does not exist yet.
 *
 * @param {string} markerPath - Value of onboardingMarkerPath().
 * @returns {boolean} True on the very first run.
 */
function isFirstRun(markerPath) {
  return !fs.existsSync(markerPath);
}

/**
 * Records that the first-run guidance has been shown, so it never opens again.
 *
 * @param {string} markerPath - Value of onboardingMarkerPath().
 */
function markOnboardingDone(markerPath) {
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, new Date().toISOString(), 'utf-8');
}

/**
 * Whether the desktop session is Wayland, where the strip and wallpaper cannot work.
 *
 * @param {Record<string, string|undefined>} env - Process environment.
 * @returns {boolean} True on a Wayland session.
 */
function isWaylandSession(env) {
  return env.XDG_SESSION_TYPE === 'wayland';
}

module.exports = { onboardingMarkerPath, isFirstRun, markOnboardingDone, isWaylandSession };

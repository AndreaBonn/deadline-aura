'use strict';

/**
 * State of the one-time "this is the strip" hint shown during the first session.
 *
 * @param {object} deps - Injected collaborators.
 * @param {string} deps.markerPath - Onboarding marker location.
 * @param {(markerPath: string) => boolean} deps.isFirstRun - True when no marker exists yet.
 * @param {(markerPath: string) => void} deps.markDone - Writes the marker.
 * @param {{warn: Function}} deps.log - Logger.
 * @returns {{init: Function, isPending: Function, dismiss: Function, markShown: Function}}
 */
function createFirstRunHint({ markerPath, isFirstRun, markDone, log }) {
  let pending = false;
  return {
    init() {
      if (isFirstRun(markerPath)) {
        pending = true;
      }
    },
    isPending: () => pending,
    dismiss() {
      pending = false;
    },
    /** Written only once the sidebar is on screen, so a crash before this point retries. */
    markShown() {
      try {
        markDone(markerPath);
      } catch (err) {
        log.warn('onboarding: could not write marker:', err.message);
      }
    },
  };
}

module.exports = { createFirstRunHint };

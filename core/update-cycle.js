'use strict';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const { buildSidebarUpdate } = require('./update-payload');

function collectUsageRows(deps, wallpaper) {
  if (!wallpaper.show_ai_usage) {
    return [];
  }
  try {
    return deps.collectUsage({ nowMs: deps.now(), lang: deps.getLanguage() });
  } catch (err) {
    deps.log.warn('runUpdateCycle: failed to collect AI usage:', err.message);
    return [];
  }
}

async function updateWallpaper(deps, { engineResult, palette, force }) {
  const calendarEvents = deps.db.getUpcomingCalendarEvents(ONE_DAY_MS);
  const usageRows = collectUsageRows(deps, deps.getConfig().wallpaper);
  await deps.wallpaperChanger.update(palette, {
    engineResult,
    force,
    electronScreen: deps.screen,
    calendarEvents,
    usageRows,
  });
}

function sendSidebarUpdate(deps, engineResult, palette) {
  const pinnedIds = new Set(deps.pinnedQueries.getAllPinned().map((p) => p.task_id));
  const favoriteIds = deps.favoriteQueries.getAllFavoriteIds();
  const aiResponse = deps.db.getLatestAiCacheResponse();
  deps.sidebar.sendWhenReady('update', () =>
    buildSidebarUpdate({
      engineResult,
      palette,
      pinnedIds,
      favoriteIds,
      aiResponse,
      syncStatus: deps.getSyncStatus(),
      googleCalendarReady: deps.isGoogleCalendarReady(deps.getConfig()),
      showFirstRunHint: deps.isFirstRunHintPending(),
    }),
  );
}

async function runCycle(deps, force) {
  const engineResult = deps.runEngine(deps.getConfig());
  const palette = deps.mapScoreToColor(engineResult.global_score);
  if (deps.getConfig().wallpaper.enabled) {
    await updateWallpaper(deps, { engineResult, palette, force });
  }
  deps.strips.updateStripColor(palette.accent_hex);
  deps.meetingDocks.updateMeetingDocks();
  sendSidebarUpdate(deps, engineResult, palette);
  return { engineResult, palette };
}

/**
 * Build the update cycle: recompute the score and redraw wallpaper, strips,
 * meeting docks and sidebar. Re-entrant calls are ignored while one is running;
 * a failure is logged and yields null.
 *
 * @param {object} deps - Injected collaborators (config accessor, engine, stores,
 *   windows, wallpaper, logger, clock).
 * @returns {(options?: {force?: boolean}) => Promise<{engineResult: object, palette: object}|null|undefined>}
 */
function createUpdateCycle(deps) {
  let running = false;
  return async function runUpdateCycle({ force = false } = {}) {
    if (running) {
      return undefined;
    }
    running = true;
    try {
      return await runCycle(deps, force);
    } catch (err) {
      try {
        deps.log.error('Update cycle error:', err.message);
      } catch {
        // EPIPE: pipe closed, ignore logging failure
      }
      return null;
    } finally {
      running = false;
    }
  };
}

module.exports = { createUpdateCycle };

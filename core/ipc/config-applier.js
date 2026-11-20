'use strict';

/**
 * Persist-and-propagate steps shared by the config-saving IPC handlers.
 *
 * Order matters and is pinned by tests: save to disk, reload (the loaded form
 * is the source of truth, e.g. defaults filled in), publish it to the app,
 * optionally reschedule the data sync (it reads the freshly published config),
 * tell the sidebar, and for settings force a wallpaper redraw (a new background
 * mode must show at once, not at the next hue change). A throwing `saveConfig`
 * aborts everything.
 *
 * @param {object} deps - Injected collaborators.
 * @param {(data: object) => void} deps.saveConfig - Writes the config to disk.
 * @param {() => object} deps.loadConfig - Reads the config back.
 * @param {(config: object) => void} deps.setConfig - Replaces the app's live config.
 * @param {() => void} deps.scheduleDataSync - Re-arms the sync timer for the new interval.
 * @param {(config: object) => void} deps.notifySidebar - Pushes the new config to the sidebar.
 * @param {(options: {force: boolean}) => unknown} deps.refresh - Runs an update cycle.
 * @returns {{applySettings: Function, applyFlyby: Function}} `applySettings` also
 *   reschedules the sync and redraws; `applyFlyby` does neither (flyby never
 *   changes sync timing or the wallpaper).
 */
function createConfigApplier({
  saveConfig,
  loadConfig,
  setConfig,
  scheduleDataSync,
  notifySidebar,
  refresh,
}) {
  function persist(data) {
    saveConfig(data);
    const loaded = loadConfig();
    setConfig(loaded);
    return loaded;
  }

  return {
    applySettings(data) {
      const loaded = persist(data);
      scheduleDataSync();
      notifySidebar(loaded);
      refresh({ force: true });
    },
    applyFlyby(data) {
      notifySidebar(persist(data));
    },
  };
}

module.exports = { createConfigApplier };

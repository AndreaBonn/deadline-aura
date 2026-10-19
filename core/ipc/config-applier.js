'use strict';

/**
 * Persist-and-propagate steps shared by the config-saving IPC handlers.
 *
 * Order matters and is pinned by tests: save to disk, reload (the loaded form
 * is the source of truth, e.g. defaults filled in), publish it to the app,
 * optionally reschedule the data sync (it reads the freshly published config),
 * and only then tell the sidebar. A throwing `saveConfig` aborts everything.
 *
 * @param {object} deps - Injected collaborators.
 * @param {(data: object) => void} deps.saveConfig - Writes the config to disk.
 * @param {() => object} deps.loadConfig - Reads the config back.
 * @param {(config: object) => void} deps.setConfig - Replaces the app's live config.
 * @param {() => void} deps.scheduleDataSync - Re-arms the sync timer for the new interval.
 * @param {(config: object) => void} deps.notifySidebar - Pushes the new config to the sidebar.
 * @returns {{applySettings: Function, applyFlyby: Function}} `applySettings` also
 *   reschedules the sync; `applyFlyby` does not (flyby never changes sync timing).
 */
function createConfigApplier({
  saveConfig,
  loadConfig,
  setConfig,
  scheduleDataSync,
  notifySidebar,
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
    },
    applyFlyby(data) {
      notifySidebar(persist(data));
    },
  };
}

module.exports = { createConfigApplier };

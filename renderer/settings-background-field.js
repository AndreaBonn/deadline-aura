'use strict';

/* global t, createField, createSelect */
/* Wallpaper background source selector. A stored mode with no matching option (custom, until
   its option exists) is left in the config: the select shows the first option but nothing is
   rewritten unless the user picks a value. */

const BACKGROUND_MODE_OPTIONS = ['dynamic', 'gradient'];

// eslint-disable-next-line no-unused-vars -- called by settings-tab-display.js
function buildBackgroundModeField(config, ctx) {
  const options = BACKGROUND_MODE_OPTIONS.map((mode) => ({
    value: mode,
    label: t(`settings.background_mode_${mode}`),
  }));
  const select = createSelect(config.wallpaper.background_mode, options, (v) => {
    config.wallpaper.background_mode = v;
    ctx.rerender();
  });
  return createField(t('settings.background_mode'), select, t('settings.background_mode_hint'));
}

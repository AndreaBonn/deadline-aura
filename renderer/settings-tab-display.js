'use strict';

/* global t, createField, createFieldGroup, createToggle, createNumberInput, createRangeWithValue,
   createSelect, createTextInput, renderCaptureControl */
/* Display tabs: Wallpaper, AI usage, Sidebar, Notifications and UI. Rendered with the tab
   context of settings.js: { getConfig, defaults, api, rerender, rerenderSoon }. */

function buildWallpaperBasicFields(config) {
  return [
    createField(
      t('common.enabled'),
      createToggle(config.wallpaper.enabled, (v) => {
        config.wallpaper.enabled = v;
      }),
    ),
    createField(
      t('settings.min_score_delta'),
      createRangeWithValue(
        config.wallpaper.min_score_delta,
        { min: 0, max: 0.5, step: 0.01 },
        (v) => {
          config.wallpaper.min_score_delta = v;
        },
      ),
      t('settings.min_score_delta_hint'),
    ),
    createField(
      t('settings.show_text'),
      createToggle(config.wallpaper.show_text, (v) => {
        config.wallpaper.show_text = v;
      }),
    ),
  ];
}

function buildResolutionSelect(config, rerender) {
  return createSelect(
    config.wallpaper.resolution === 'auto' ? 'auto' : 'custom',
    [
      { value: 'auto', label: t('settings.auto') },
      { value: 'custom', label: t('settings.custom') },
    ],
    (v) => {
      if (v === 'auto') {
        config.wallpaper.resolution = 'auto';
      }
      rerender();
    },
  );
}

function buildWallpaperBackgroundFields(config, rerender) {
  const fields = [
    createField(
      t('settings.photo_backgrounds'),
      createToggle(config.wallpaper.use_backgrounds, (v) => {
        config.wallpaper.use_backgrounds = v;
      }),
    ),
    createField(t('settings.resolution'), buildResolutionSelect(config, rerender)),
  ];
  if (config.wallpaper.resolution !== 'auto') {
    fields.push(
      createField(
        t('settings.custom_resolution'),
        createTextInput(config.wallpaper.resolution, { placeholder: '1920x1080' }, (v) => {
          config.wallpaper.resolution = v;
        }),
      ),
    );
  }
  return fields;
}

function buildPostitGroup(config) {
  const postit = createFieldGroup(t('settings.postit'));
  postit.append(
    createField(
      t('settings.postit_enabled'),
      createToggle(config.wallpaper.postit.enabled, (v) => {
        config.wallpaper.postit.enabled = v;
      }),
    ),
    createField(
      t('settings.max_per_display'),
      createNumberInput(config.wallpaper.postit.max_per_display, { min: 1, max: 20 }, (v) => {
        config.wallpaper.postit.max_per_display = v;
      }),
    ),
  );
  return postit;
}

// eslint-disable-next-line no-unused-vars -- called by settings.js through the renderers table
function renderWallpaper(ctx) {
  const config = ctx.getConfig();
  const group = createFieldGroup(t('settings.tabs.wallpaper'));
  group.append(...buildWallpaperBasicFields(config));
  group.append(...buildWallpaperBackgroundFields(config, ctx.rerender));
  return [group, buildPostitGroup(config)];
}

// Claude/Codex usage band and its statusline capture: a niche, kept out of Wallpaper.
// eslint-disable-next-line no-unused-vars -- called by settings.js through the renderers table
function renderLimiti(ctx) {
  const { api } = ctx;
  const config = ctx.getConfig();
  const group = createFieldGroup(t('settings.tabs.ai_usage'));
  group.appendChild(
    createField(
      t('settings.show_ai_usage'),
      createToggle(config.wallpaper.show_ai_usage, (v) => {
        config.wallpaper.show_ai_usage = v;
      }),
    ),
  );
  const captureContainer = document.createElement('div');
  renderCaptureControl(captureContainer, api, t);
  group.appendChild(captureContainer);
  return [group];
}

function buildSidebarPositionField(config) {
  return createField(
    t('settings.position'),
    createSelect(
      config.sidebar.position,
      [
        { value: 'left', label: t('settings.left') },
        { value: 'right', label: t('settings.right') },
      ],
      (v) => {
        config.sidebar.position = v;
      },
    ),
  );
}

// eslint-disable-next-line no-unused-vars -- called by settings.js through the renderers table
function renderSidebar(ctx) {
  const config = ctx.getConfig();
  const group = createFieldGroup(t('settings.tabs.sidebar'));
  group.append(
    buildSidebarPositionField(config),
    createField(
      t('settings.width'),
      createNumberInput(config.sidebar.width, { min: 200, max: 400 }, (v) => {
        config.sidebar.width = v;
      }),
      t('settings.pixels'),
    ),
    createField(
      t('settings.opacity'),
      createRangeWithValue(config.sidebar.opacity, { min: 0.1, max: 1, step: 0.05 }, (v) => {
        config.sidebar.opacity = v;
      }),
    ),
  );
  return [group];
}

function buildNotificationsGroup(config) {
  const group = createFieldGroup(t('settings.notifications_group'));
  group.append(
    createField(
      t('settings.notifications_enabled'),
      createToggle(config.notifications.enabled, (v) => {
        config.notifications.enabled = v;
      }),
    ),
    createField(
      t('settings.score_threshold'),
      createRangeWithValue(
        config.notifications.threshold_score,
        { min: 0, max: 1, step: 0.05 },
        (v) => {
          config.notifications.threshold_score = v;
        },
      ),
      t('settings.score_threshold_hint'),
    ),
    createField(
      t('settings.cooldown'),
      createNumberInput(config.notifications.cooldown_minutes, { min: 1, max: 1440 }, (v) => {
        config.notifications.cooldown_minutes = v;
      }),
      t('settings.cooldown_hint'),
    ),
  );
  return group;
}

function buildMeetingDockGroup(config) {
  if (!config.meeting_dock) {
    config.meeting_dock = { enabled: true, lookahead_minutes: 10 };
  }
  const dockGroup = createFieldGroup(t('settings.meeting_dock_group'));
  dockGroup.append(
    createField(
      t('common.enabled'),
      createToggle(config.meeting_dock.enabled, (v) => {
        config.meeting_dock.enabled = v;
      }),
    ),
    createField(
      t('settings.meeting_dock_lookahead'),
      createNumberInput(config.meeting_dock.lookahead_minutes, { min: 1, max: 30 }, (v) => {
        config.meeting_dock.lookahead_minutes = v;
      }),
      t('settings.meeting_dock_lookahead_hint'),
    ),
  );
  return dockGroup;
}

// eslint-disable-next-line no-unused-vars -- called by settings.js through the renderers table
function renderNotifiche(ctx) {
  const config = ctx.getConfig();
  return [buildNotificationsGroup(config), buildMeetingDockGroup(config)];
}

function buildLanguageField(config) {
  return createField(
    t('settings.language'),
    createSelect(
      config.language || 'it',
      [
        { value: 'it', label: 'Italiano' },
        { value: 'en', label: 'English' },
      ],
      (v) => {
        config.language = v;
      },
    ),
    t('settings.language_hint'),
  );
}

function buildCountdownFormatField(config) {
  return createField(
    t('settings.countdown_format'),
    createSelect(
      config.ui.countdown_format,
      [
        { value: 'relative', label: t('settings.relative') },
        { value: 'absolute', label: t('settings.absolute') },
        { value: 'both', label: t('settings.both') },
      ],
      (v) => {
        config.ui.countdown_format = v;
      },
    ),
  );
}

// eslint-disable-next-line no-unused-vars -- called by settings.js through the renderers table
function renderUI(ctx) {
  const config = ctx.getConfig();
  const group = createFieldGroup(t('settings.ui_group'));
  group.append(
    buildLanguageField(config),
    createField(
      t('settings.max_tasks_shown'),
      createNumberInput(config.ui.max_tasks_shown, { min: 1, max: 20 }, (v) => {
        config.ui.max_tasks_shown = v;
      }),
    ),
    createField(
      t('settings.source_badge'),
      createToggle(config.ui.show_source_badge, (v) => {
        config.ui.show_source_badge = v;
      }),
      t('settings.source_badge_hint'),
    ),
    buildCountdownFormatField(config),
  );
  return [group];
}

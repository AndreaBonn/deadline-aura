'use strict';

/* global t, createField, createSelect */
/* Wallpaper background source: a mode selector and, in custom mode, the image picker with its
   status line. The picker saves the copied file main-side; here the returned name is mirrored in
   the renderer config so a later Save does not write the old name back. */

const BACKGROUND_MODE_OPTIONS = ['dynamic', 'gradient', 'custom'];
const BACKGROUND_ERROR_ID = 'backgroundImageError';

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

function describeBackgroundStatus(status) {
  if (status.state === 'ok') {
    return `${status.file}, ${status.width} × ${status.height} px`;
  }
  return `${t(`settings.background_status_${status.state}`)} ${t('settings.background_fallback')}`;
}

function showBackgroundStatus(statusEl, status) {
  statusEl.textContent = status ? describeBackgroundStatus(status) : '';
}

function showBackgroundError(button, errorEl, code) {
  const failed = Boolean(code) && code !== 'CANCELLED';
  errorEl.textContent = failed ? t(`settings.background_error_${code}`) : '';
  if (failed) {
    button.setAttribute('aria-describedby', BACKGROUND_ERROR_ID);
  } else {
    button.removeAttribute('aria-describedby');
  }
}

async function pickBackgroundImage(config, api, parts) {
  const { button, statusEl, errorEl } = parts;
  button.disabled = true;
  try {
    const result = await api.pickBackground();
    showBackgroundError(button, errorEl, result.ok ? null : result.error);
    if (result.ok) {
      config.wallpaper.custom_background = result.file;
      showBackgroundStatus(statusEl, { state: 'ok', ...result });
    }
  } finally {
    button.disabled = false;
  }
}

function createBackgroundPicker(config, api) {
  const box = document.createElement('div');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--secondary btn--small';
  button.textContent = t('settings.background_pick');
  const statusEl = document.createElement('div');
  statusEl.className = 'background-status ai-capture-status';
  statusEl.setAttribute('aria-live', 'polite');
  const errorEl = document.createElement('div');
  errorEl.id = BACKGROUND_ERROR_ID;
  errorEl.setAttribute('role', 'alert');
  errorEl.className = 'background-error ai-capture-message ai-capture-message--error';
  button.addEventListener('click', () =>
    pickBackgroundImage(config, api, { button, statusEl, errorEl }),
  );
  box.append(button, statusEl, errorEl);
  api
    .backgroundStatus()
    .then((status) => showBackgroundStatus(statusEl, status))
    .catch(() => showBackgroundStatus(statusEl, { state: 'unreadable' }));
  return box;
}

// eslint-disable-next-line no-unused-vars -- called by settings-tab-display.js
function buildBackgroundImageField(config, ctx) {
  if (config.wallpaper.background_mode !== 'custom') {
    return null;
  }
  return createField(t('settings.background_image'), createBackgroundPicker(config, ctx.api));
}

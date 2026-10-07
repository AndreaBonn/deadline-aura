'use strict';

/* eslint-disable no-unused-vars */
/* Claude Code statusline capture control, rendered in the wallpaper section of
   settings and consumed by settings.js via <script> */

/**
 * Build the static elements of the capture control.
 *
 * @param {(key: string) => string} t - Translation function.
 * @returns {{title: HTMLElement, status: HTMLElement, note: HTMLElement,
 *   button: HTMLButtonElement, message: HTMLElement}}
 */
function createCaptureElements(t) {
  const title = document.createElement('div');
  title.className = 'field-group-title';
  title.textContent = t('settings.ai_capture.title');

  const status = document.createElement('div');
  status.className = 'ai-capture-status';

  const note = document.createElement('p');
  note.className = 'field-hint ai-capture-note';
  note.textContent = t('settings.ai_capture.note');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn--secondary btn--small';

  const message = document.createElement('div');
  message.className = 'ai-capture-message';
  message.setAttribute('role', 'status');

  return { title, status, note, button, message };
}

const STATUS_KEYS = {
  on: 'settings.ai_capture.status_on',
  off: 'settings.ai_capture.status_off',
  unknown: 'settings.ai_capture.status_unknown',
};

/**
 * Show the installed state on the status line and the button label. An
 * 'unknown' state (captureStatus() rejected) renders as its own message,
 * distinct from 'off', but the button still offers install.
 *
 * @param {ReturnType<typeof createCaptureElements>} els
 * @param {'on'|'off'|'unknown'} installedState
 * @param {(key: string) => string} t
 */
function renderCaptureStatus(els, installedState, t) {
  els.status.textContent = t(STATUS_KEYS[installedState]);
  els.button.textContent =
    installedState === 'on' ? t('settings.ai_capture.uninstall') : t('settings.ai_capture.install');
}

/**
 * Show an outcome message; an empty kind clears the styling.
 *
 * @param {HTMLElement} message
 * @param {string} text
 * @param {'success'|'error'|''} kind
 */
function showCaptureMessage(message, text, kind) {
  message.textContent = text || '';
  message.className = kind
    ? `ai-capture-message ai-capture-message--${kind}`
    : 'ai-capture-message';
}

/**
 * Turn a failed installer result into a readable message.
 *
 * @param {{error?: string, detail?: string}|null} result
 * @param {(key: string) => string} t
 * @returns {string}
 */
function describeCaptureFailure(result, t) {
  if (result && result.error === 'python3_missing') {
    return t('settings.ai_capture.python_missing');
  }
  const base = t('settings.ai_capture.failed');
  return result && result.detail ? `${base}: ${result.detail}` : base;
}

/**
 * Turn an installer result into the message text and its kind.
 *
 * @param {{ok?: boolean, warnings?: string[]}|null} result
 * @param {(key: string) => string} t
 * @returns {{text: string, kind: 'success'|'error'}}
 */
function describeCaptureResult(result, t) {
  if (!result || !result.ok) {
    return { text: describeCaptureFailure(result, t), kind: 'error' };
  }
  const warnings = result.warnings && result.warnings.length ? ` ${result.warnings.join(' ')}` : '';
  return { text: `${t('settings.ai_capture.success')}${warnings}`, kind: 'success' };
}

/**
 * Read the installed state. A rejected captureStatus() call is logged and
 * mapped to 'unknown', distinct from the confirmed-absent 'off' state.
 *
 * @param {object} api - `window.settingsApi`.
 * @returns {Promise<'on'|'off'|'unknown'>}
 */
async function readCaptureInstalled(api) {
  try {
    const result = await api.captureStatus();
    return result && result.installed ? 'on' : 'off';
  } catch (err) {
    console.error('settings-ai-capture: captureStatus failed', err);
    return 'unknown';
  }
}

/**
 * Render the Claude Code statusline capture control (status, install or
 * remove button, outcome message) into `container`.
 *
 * @param {HTMLElement} container - Empty element to render into.
 * @param {object} api - `window.settingsApi` (captureStatus/Install/Uninstall).
 * @param {(key: string) => string} t - Translation function.
 */
function renderCaptureControl(container, api, t) {
  const els = createCaptureElements(t);
  const state = { installed: false };
  container.textContent = '';
  container.className = 'ai-capture';
  container.append(els.title, els.status, els.note, els.button, els.message);

  const refresh = async () => {
    const installedState = await readCaptureInstalled(api);
    state.installed = installedState === 'on';
    renderCaptureStatus(els, installedState, t);
  };
  els.button.addEventListener('click', () => runCaptureAction({ els, api, t, state, refresh }));
  refresh();
}

/**
 * Install or remove the capture, asking for confirmation before installing.
 *
 * @param {{els: ReturnType<typeof createCaptureElements>, api: object,
 *   t: (key: string) => string, state: {installed: boolean},
 *   refresh: () => Promise<void>}} ctx
 */
async function runCaptureAction({ els, api, t, state, refresh }) {
  const confirmText = `${t('settings.ai_capture.note')}\n\n${t('settings.ai_capture.confirm')}`;
  if (!state.installed && !window.confirm(confirmText)) {
    return;
  }
  els.button.disabled = true;
  els.button.textContent = t('settings.ai_capture.working');
  showCaptureMessage(els.message, '', '');
  try {
    const result = state.installed ? await api.captureUninstall() : await api.captureInstall();
    const { text, kind } = describeCaptureResult(result, t);
    showCaptureMessage(els.message, text, kind);
  } catch (err) {
    showCaptureMessage(els.message, describeCaptureFailure({ detail: err.message }, t), 'error');
  } finally {
    els.button.disabled = false;
    await refresh();
  }
}

// In the browser the functions are available as globals via <script src>.
if (typeof module !== 'undefined') {
  module.exports = {
    readCaptureInstalled,
    describeCaptureFailure,
    describeCaptureResult,
    renderCaptureStatus,
    showCaptureMessage,
  };
}

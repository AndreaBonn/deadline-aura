'use strict';

const {
  readCaptureInstalled,
  describeCaptureFailure,
  describeCaptureResult,
  renderCaptureStatus,
  showCaptureMessage,
} = require('../../renderer/settings-ai-capture');

describe('settings-ai-capture — readCaptureInstalled', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "on" when captureStatus resolves with installed: true', async () => {
    const api = { captureStatus: vi.fn().mockResolvedValue({ installed: true }) };

    await expect(readCaptureInstalled(api)).resolves.toBe('on');
  });

  it('returns "off" when captureStatus resolves with installed: false', async () => {
    const api = { captureStatus: vi.fn().mockResolvedValue({ installed: false }) };

    await expect(readCaptureInstalled(api)).resolves.toBe('off');
  });

  it('returns "unknown" and logs when captureStatus rejects', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const api = { captureStatus: vi.fn().mockRejectedValue(new Error('ipc timeout')) };

    await expect(readCaptureInstalled(api)).resolves.toBe('unknown');

    expect(errorSpy).toHaveBeenCalled();
  });
});

const TRANSLATIONS = {
  'settings.ai_capture.python_missing': 'Python is missing',
  'settings.ai_capture.failed': 'Capture failed',
  'settings.ai_capture.success': 'Capture updated',
  'settings.ai_capture.status_on': 'Enabled',
  'settings.ai_capture.status_off': 'Disabled',
  'settings.ai_capture.status_unknown': 'Status unavailable',
  'settings.ai_capture.install': 'Install',
  'settings.ai_capture.uninstall': 'Uninstall',
};
const translate = (key) => TRANSLATIONS[key];

describe('describeCaptureFailure', () => {
  it.each([
    ['missing Python', { error: 'python3_missing', detail: 'ignored' }, 'Python is missing'],
    ['error detail', { detail: 'permission denied' }, 'Capture failed: permission denied'],
    ['generic error', { error: 'command_failed' }, 'Capture failed'],
    ['empty detail', { detail: '' }, 'Capture failed'],
    ['absent result', null, 'Capture failed'],
  ])('describes %s', (_label, outcome, expected) => {
    const result = describeCaptureFailure(outcome, translate);

    expect(result).toBe(expected);
  });
});

describe('describeCaptureResult', () => {
  it.each([
    ['success without warnings', { ok: true }, { text: 'Capture updated', kind: 'success' }],
    [
      'success with empty warnings',
      { ok: true, warnings: [] },
      { text: 'Capture updated', kind: 'success' },
    ],
    [
      'success with warnings',
      { ok: true, warnings: ['Restart required.', 'Check settings.'] },
      { text: 'Capture updated Restart required. Check settings.', kind: 'success' },
    ],
    [
      'failure with detail',
      { ok: false, detail: 'permission denied' },
      { text: 'Capture failed: permission denied', kind: 'error' },
    ],
    [
      'missing Python',
      { ok: false, error: 'python3_missing' },
      { text: 'Python is missing', kind: 'error' },
    ],
    ['absent result', null, { text: 'Capture failed', kind: 'error' }],
  ])('describes %s', (_label, outcome, expected) => {
    const result = describeCaptureResult(outcome, translate);

    expect(result).toEqual(expected);
  });
});

describe('renderCaptureStatus', () => {
  it.each([
    ['on', 'Enabled', 'Uninstall'],
    ['off', 'Disabled', 'Install'],
    ['unknown', 'Status unavailable', 'Install'],
  ])('renders the %s state and its available action', (state, status, action) => {
    const elements = { status: { textContent: 'Previous' }, button: { textContent: 'Working' } };

    renderCaptureStatus(elements, state, translate);

    expect(elements).toEqual({ status: { textContent: status }, button: { textContent: action } });
  });
});

describe('showCaptureMessage', () => {
  it.each([
    ['success', 'Saved', 'success', 'ai-capture-message ai-capture-message--success'],
    ['error', 'Failed', 'error', 'ai-capture-message ai-capture-message--error'],
    ['unstyled message', 'Waiting', '', 'ai-capture-message'],
    ['clear message', '', '', 'ai-capture-message'],
    ['absent message', undefined, '', 'ai-capture-message'],
  ])('renders %s and replaces previous styling', (_label, text, kind, className) => {
    const message = { textContent: 'Previous', className: 'ai-capture-message previous' };

    showCaptureMessage(message, text, kind);

    expect(message).toEqual({ textContent: text || '', className });
  });
});

describe('renderCaptureControl — install and uninstall actions', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const { Window } = require('happy-dom');

  const SOURCE_FILE = path.resolve(__dirname, '../../renderer/settings-ai-capture.js');
  const NOTE = 'Edits the statusline';
  const CONFIRM = 'Proceed?';
  const CONTROL_TEXT = {
    ...TRANSLATIONS,
    'settings.ai_capture.note': NOTE,
    'settings.ai_capture.confirm': CONFIRM,
    'settings.ai_capture.working': 'Working',
  };

  let win;

  beforeEach(() => {
    win = new Window();
    vm.runInContext(fs.readFileSync(SOURCE_FILE, 'utf8'), win, { filename: SOURCE_FILE });
  });

  afterEach(() => {
    win.close();
  });

  const flush = async () => {
    for (let i = 0; i < 20; i += 1) {
      await Promise.resolve();
    }
  };

  async function mountControl({ installed, confirmAnswer = true, install, uninstall }) {
    const api = {
      captureStatus: vi.fn().mockResolvedValue({ installed }),
      captureInstall: vi.fn(install || (async () => ({ ok: true }))),
      captureUninstall: vi.fn(uninstall || (async () => ({ ok: true }))),
    };
    win.confirm = vi.fn(() => confirmAnswer);
    win.api = api;
    win.t = (key) => CONTROL_TEXT[key];
    const container = win.document.createElement('div');
    win.container = container;
    vm.runInContext('renderCaptureControl(window.container, window.api, window.t)', win);
    await flush();
    const button = container.querySelector('button');
    const message = container.querySelector('.ai-capture-message');
    return { api, button, message, confirm: win.confirm };
  }

  it('does not install when the user declines the confirmation', async () => {
    const { api, button, message, confirm } = await mountControl({
      installed: false,
      confirmAnswer: false,
    });

    button.click();
    await flush();

    expect({
      confirmCalls: confirm.mock.calls.length,
      installCalls: api.captureInstall.mock.calls.length,
      uninstallCalls: api.captureUninstall.mock.calls.length,
      message: message.textContent,
      buttonDisabled: button.disabled,
    }).toEqual({
      confirmCalls: 1,
      installCalls: 0,
      uninstallCalls: 0,
      message: '',
      buttonDisabled: false,
    });
  });

  it('installs once after confirmation, showing the note and the question in the prompt', async () => {
    const { api, button, message, confirm } = await mountControl({
      installed: false,
      confirmAnswer: true,
    });

    button.click();
    await flush();

    expect({
      confirmText: confirm.mock.calls[0][0],
      installCalls: api.captureInstall.mock.calls.length,
      uninstallCalls: api.captureUninstall.mock.calls.length,
      message: message.textContent,
      messageClass: message.className,
    }).toEqual({
      confirmText: `${NOTE}\n\n${CONFIRM}`,
      installCalls: 1,
      uninstallCalls: 0,
      message: 'Capture updated',
      messageClass: 'ai-capture-message ai-capture-message--success',
    });
  });

  it('uninstalls without asking for confirmation when the capture is installed', async () => {
    const { api, button, message, confirm } = await mountControl({
      installed: true,
      confirmAnswer: false,
    });

    button.click();
    await flush();

    expect({
      confirmCalls: confirm.mock.calls.length,
      installCalls: api.captureInstall.mock.calls.length,
      uninstallCalls: api.captureUninstall.mock.calls.length,
      message: message.textContent,
    }).toEqual({
      confirmCalls: 0,
      installCalls: 0,
      uninstallCalls: 1,
      message: 'Capture updated',
    });
  });

  it('disables the button while the install is running', async () => {
    let finishInstall;
    const { button } = await mountControl({
      installed: false,
      install: () => new Promise((resolve) => (finishInstall = resolve)),
    });

    button.click();
    await flush();
    const during = { disabled: button.disabled, label: button.textContent };
    finishInstall({ ok: true });
    await flush();

    expect({ during, after: button.disabled }).toEqual({
      during: { disabled: true, label: 'Working' },
      after: false,
    });
  });

  it('shows the error, re-enables the button and reloads the status when install rejects', async () => {
    const { api, button, message } = await mountControl({
      installed: false,
      install: async () => {
        throw new Error('EACCES');
      },
    });

    button.click();
    await flush();

    expect({
      message: message.textContent,
      messageClass: message.className,
      buttonDisabled: button.disabled,
      buttonLabel: button.textContent,
      statusReads: api.captureStatus.mock.calls.length,
    }).toEqual({
      message: 'Capture failed: EACCES',
      messageClass: 'ai-capture-message ai-capture-message--error',
      buttonDisabled: false,
      buttonLabel: 'Install',
      statusReads: 2,
    });
  });
});

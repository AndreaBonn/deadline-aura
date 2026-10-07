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

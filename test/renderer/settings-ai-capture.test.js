'use strict';

const { readCaptureInstalled } = require('../../renderer/settings-ai-capture');

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

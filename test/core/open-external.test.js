'use strict';

const { openExternalUrl } = require('../../core/open-external');

const SAFE_URL = 'https://example.com/meeting';

function makeDependencies() {
  const unref = vi.fn();
  return {
    which: vi.fn(),
    spawnDetached: vi.fn(() => ({ unref })),
    unref,
  };
}

describe('openExternalUrl', () => {
  it.each(['javascript:alert(1)', 'http://localhost', null, undefined, 42, {}, new URL(SAFE_URL)])(
    'rejects unsafe or non-string input %s while allowing HTTPS',
    (url) => {
      const dependencies = makeDependencies();
      openExternalUrl(url, dependencies);
      expect(dependencies.spawnDetached).not.toHaveBeenCalled();
      expect(dependencies.which).not.toHaveBeenCalled();
      openExternalUrl(SAFE_URL, dependencies);
      expect(dependencies.spawnDetached).toHaveBeenCalledWith('firefox', [SAFE_URL], {
        detached: true,
        stdio: 'ignore',
      });
      expect(dependencies.unref).toHaveBeenCalledOnce();
    },
  );

  it.each(['firefox', 'google-chrome', 'chromium-browser', 'chromium'])(
    'uses the first available browser %s',
    (available) => {
      const dependencies = makeDependencies();
      const attempted = [];
      dependencies.which.mockImplementation((browser) => {
        attempted.push(browser);
        if (browser !== available) {
          throw new Error('Not found');
        }
      });
      openExternalUrl(SAFE_URL, dependencies);
      expect(attempted.at(-1)).toBe(available);
      expect(dependencies.spawnDetached).toHaveBeenCalledOnce();
      expect(dependencies.spawnDetached).toHaveBeenCalledWith(available, [SAFE_URL], {
        detached: true,
        stdio: 'ignore',
      });
      expect(dependencies.unref).toHaveBeenCalledOnce();
    },
  );

  it('falls back to xdg-open when every lookup fails', () => {
    const dependencies = makeDependencies();
    dependencies.which.mockImplementation(() => {
      throw new Error('Not found');
    });
    openExternalUrl(SAFE_URL, dependencies);
    expect(dependencies.which.mock.calls.map(([browser]) => browser)).toEqual([
      'firefox',
      'google-chrome',
      'chromium-browser',
      'chromium',
    ]);
    expect(dependencies.spawnDetached).toHaveBeenCalledOnce();
    expect(dependencies.spawnDetached).toHaveBeenCalledWith('xdg-open', [SAFE_URL], {
      detached: true,
      stdio: 'ignore',
    });
    expect(dependencies.unref).toHaveBeenCalledOnce();
  });

  it('tries the next browser after a synchronous spawn or unref failure', () => {
    const dependencies = makeDependencies();
    dependencies.spawnDetached.mockImplementationOnce(() => {
      throw new Error('Spawn failed');
    });
    dependencies.spawnDetached.mockReturnValueOnce({
      unref: () => {
        throw new Error('Unref failed');
      },
    });
    openExternalUrl(SAFE_URL, dependencies);
    expect(dependencies.spawnDetached.mock.calls.map(([browser]) => browser)).toEqual([
      'firefox',
      'google-chrome',
      'chromium-browser',
    ]);
    expect(dependencies.unref).toHaveBeenCalledOnce();
  });

  it('propagates fallback spawn errors', () => {
    const dependencies = makeDependencies();
    dependencies.which.mockImplementation(() => {
      throw new Error('Not found');
    });
    dependencies.spawnDetached.mockImplementation(() => {
      throw new Error('Fallback failed');
    });
    expect(() => openExternalUrl(SAFE_URL, dependencies)).toThrow('Fallback failed');
  });
});

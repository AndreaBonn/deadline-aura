// @vitest-environment happy-dom
'use strict';

const { loadSidebarPage } = require('./harness');

let page;
afterEach(() => page.dispose());

// The page logs on its own window console, which exists only after the load: the translations
// are held back until the spy is installed, then released as a failure or as a success.
async function loadWithHeldTranslations() {
  let release;
  const held = new Promise((resolve, reject) => (release = { resolve, reject }));
  page = await loadSidebarPage({ answers: { getTranslations: () => held } });
  const log = vi.spyOn(page.win.console, 'error').mockImplementation(() => {});
  return { log, release };
}

describe('sidebar start-up failures leave a trace', () => {
  it('logs when the translations cannot be loaded, and the page still comes up', async () => {
    const { log, release } = await loadWithHeldTranslations();
    release.reject(new Error('locale missing'));
    await page.flush();
    expect(log).toHaveBeenCalledWith('i18n init failed:', 'locale missing');
    expect(page.document.querySelector('#tasksContainer')).not.toBeNull();
  });

  it('logs nothing when the translations load', async () => {
    const { log, release } = await loadWithHeldTranslations();
    release.resolve({ sidebar: {} });
    await page.flush();
    expect(page.document.querySelector('#flybyToggle')).not.toBeNull();
    expect(log).not.toHaveBeenCalled();
  });
});

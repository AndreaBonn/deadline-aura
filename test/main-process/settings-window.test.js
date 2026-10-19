const { createSettingsWindow } = require('../../main-process/settings-window');
const { createFakeElectron } = require('./fakes');

function setup() {
  const electron = createFakeElectron();
  const settings = createSettingsWindow({
    BrowserWindow: electron.BrowserWindow,
    iconPath: '/icon.png',
  });
  return { electron, settings };
}

describe('SettingsWindow', () => {
  it('open creates the window and loads the settings page', () => {
    const { settings, electron } = setup();
    settings.open();
    expect(electron.windows).toHaveLength(1);
    expect(electron.windows[0].loadedFile).toMatch(/renderer[/\\]settings\.html$/);
  });

  it('open while already open focuses the existing window instead of creating another', () => {
    const { settings, electron } = setup();
    settings.open();
    settings.open();
    expect(electron.windows).toHaveLength(1);
    expect(electron.windows[0].focusCount).toBe(1);
  });

  it('close closes the window, after which open builds a fresh one', () => {
    const { settings, electron } = setup();
    settings.open();
    settings.close();
    expect(electron.windows[0].destroyed).toBe(true);
    settings.open();
    expect(electron.windows).toHaveLength(2);
    expect(electron.windows[1].focusCount).toBe(0);
  });

  it('close without a window is a no-op', () => {
    const { settings, electron } = setup();
    settings.close();
    expect(electron.windows).toHaveLength(0);
  });

  it('a destroyed window that never fired "closed" is replaced, not focused', () => {
    const { settings, electron } = setup();
    settings.open();
    electron.windows[0].destroyed = true;
    settings.open();
    expect(electron.windows).toHaveLength(2);
    expect(electron.windows[0].focusCount).toBe(0);
  });
});

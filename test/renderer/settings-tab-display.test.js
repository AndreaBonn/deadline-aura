// @vitest-environment happy-dom
'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const { Window } = require('happy-dom');
const { DEFAULTS } = require('../../config/defaults');

const clone = (v) => JSON.parse(JSON.stringify(v));
let win;
let rerenders;
let captures;
beforeEach(() => {
  win = new Window();
  rerenders = 0;
  captures = [];
  win.rerender = () => {
    rerenders += 1;
  };
  win.api = { marker: 'api' };
  // renderCaptureControl has its own tests: here only where it is mounted and with what.
  win.recordCapture = (container, api) => captures.push({ container, api });
  vm.runInContext(
    `function t(key) { return key; }
    function renderCaptureControl(container, api, translate) {
      window.recordCapture(container, api);
      container.textContent = translate('probe');
    }`,
    win,
  );
  for (const file of [
    'settings-fields.js',
    'settings-background-field.js',
    'settings-tab-display.js',
  ]) {
    vm.runInContext(fs.readFileSync(`renderer/${file}`, 'utf8'), win, {
      filename: require('node:path').resolve(`renderer/${file}`),
    });
  }
});
afterEach(() => win.close());

function render(name, config) {
  win.ctx = { getConfig: () => config, api: win.api, rerender: win.rerender };
  const groups = vm.runInContext(`${name}(window.ctx)`, win);
  groups.forEach((g) => win.document.body.appendChild(g));
  return groups;
}

const change = (el) => el.dispatchEvent(new win.Event('change'));
const field = (group, labelKey, nth = 0) =>
  [...group.querySelectorAll('.field')].filter(
    (f) => f.querySelector('.field-label').textContent === labelKey,
  )[nth];
function setValue(el, value) {
  el.value = String(value);
  change(el);
}
function setChecked(el, checked) {
  el.checked = checked;
  change(el);
}

describe('renderWallpaper', () => {
  it('renders the wallpaper group and the post-it group', () => {
    const [wallpaper, postit] = render('renderWallpaper', clone(DEFAULTS));
    expect(wallpaper.querySelector('.field-group-title').textContent).toBe(
      'settings.tabs.wallpaper',
    );
    expect(postit.querySelector('.field-group-title').textContent).toBe('settings.postit');
  });

  it('writes toggles, score delta and post-it settings', () => {
    const config = clone(DEFAULTS);
    const [wallpaper, postit] = render('renderWallpaper', config);
    setChecked(field(wallpaper, 'common.enabled').querySelector('input'), false);
    setChecked(field(wallpaper, 'settings.show_text').querySelector('input'), false);
    setValue(
      field(wallpaper, 'settings.min_score_delta').querySelector('input[type="number"]'),
      0.2,
    );
    setChecked(field(postit, 'settings.postit_enabled').querySelector('input'), false);
    setValue(field(postit, 'settings.max_per_display').querySelector('input'), 7);
    expect(config.wallpaper).toMatchObject({
      enabled: false,
      show_text: false,
      min_score_delta: 0.2,
      postit: { enabled: false, max_per_display: 7 },
    });
  });

  it('offers dynamic, gradient and custom, preselected from the config', () => {
    const config = clone(DEFAULTS);
    config.wallpaper.background_mode = 'gradient';
    const [wallpaper] = render('renderWallpaper', config);
    const select = field(wallpaper, 'settings.background_mode').querySelector('select');
    expect([...select.options].map((o) => o.value)).toEqual(['dynamic', 'gradient', 'custom']);
    expect(select.value).toBe('gradient');
  });

  it('writes the chosen background mode and no use_backgrounds', () => {
    const config = clone(DEFAULTS);
    const [wallpaper] = render('renderWallpaper', config);
    expect(field(wallpaper, 'settings.photo_backgrounds')).toBeUndefined();
    setValue(field(wallpaper, 'settings.background_mode').querySelector('select'), 'gradient');
    expect(config.wallpaper.background_mode).toBe('gradient');
    expect(config.wallpaper).not.toHaveProperty('use_backgrounds');
  });

  it('renders the image control for a stored custom mode and leaves it untouched', () => {
    const config = clone(DEFAULTS);
    config.wallpaper.background_mode = 'custom';
    win.api = { backgroundStatus: async () => ({ state: 'none', file: null }) };
    const [wallpaper] = render('renderWallpaper', config);
    // select.value is not asserted: happy-dom misreports it when the last option is selected.
    expect(field(wallpaper, 'settings.background_image')).toBeDefined();
    expect(config.wallpaper.background_mode).toBe('custom');
  });

  describe('custom image control', () => {
    const flush = async () => {
      for (let i = 0; i < 10; i += 1) {
        await Promise.resolve();
      }
    };
    const customConfig = (mode = 'custom') => {
      const config = clone(DEFAULTS);
      config.wallpaper.background_mode = mode;
      return config;
    };
    const setApi = (status, pick) => {
      win.api = { backgroundStatus: async () => status, pickBackground: pick };
    };
    const imageField = (wallpaper) => field(wallpaper, 'settings.background_image');
    const statusText = (wallpaper) =>
      imageField(wallpaper).querySelector('.background-status').textContent;
    const errorEl = (wallpaper) => imageField(wallpaper).querySelector('.background-error');

    it('shows the pick button only in custom mode', async () => {
      setApi({ state: 'none', file: null });
      const [dyn] = render('renderWallpaper', customConfig('dynamic'));
      expect(imageField(dyn)).toBeUndefined();
      const [custom] = render('renderWallpaper', customConfig());
      expect(imageField(custom).querySelector('button').textContent).toBe(
        'settings.background_pick',
      );
    });

    it.each([
      [{ state: 'none', file: null }, 'settings.background_status_none'],
      [{ state: 'ok', file: 'a.jpg', width: 3840, height: 2160 }, 'a.jpg, 3840 \u00d7 2160 px'],
      [{ state: 'missing', file: 'a.jpg' }, 'settings.background_status_missing'],
      [{ state: 'unreadable', file: 'a.jpg' }, 'settings.background_status_unreadable'],
    ])('renders the status %j', async (status, expected) => {
      setApi(status);
      const [wallpaper] = render('renderWallpaper', customConfig());
      await flush();
      expect(statusText(wallpaper)).toContain(expected);
      const status_el = imageField(wallpaper).querySelector('.background-status');
      expect(status_el.getAttribute('aria-live')).toBe('polite');
    });

    it('adds the dynamic fallback note only when the state is not ok', async () => {
      setApi({ state: 'missing', file: 'a.jpg' });
      const [bad] = render('renderWallpaper', customConfig());
      await flush();
      expect(statusText(bad)).toContain('settings.background_fallback');
      setApi({ state: 'ok', file: 'a.jpg', width: 10, height: 20 });
      const [good] = render('renderWallpaper', customConfig());
      await flush();
      expect(statusText(good)).not.toContain('settings.background_fallback');
    });

    it('mirrors the picked file in the config and updates the status', async () => {
      const config = customConfig();
      setApi({ state: 'none', file: null }, async () => ({
        ok: true,
        file: 'custom-background.jpg',
        width: 3840,
        height: 2160,
      }));
      const [wallpaper] = render('renderWallpaper', config);
      await flush();
      imageField(wallpaper).querySelector('button').click();
      await flush();
      expect(config.wallpaper.custom_background).toBe('custom-background.jpg');
      expect(statusText(wallpaper)).toContain('custom-background.jpg, 3840 \u00d7 2160 px');
    });

    it('disables the button while the pick is pending', async () => {
      let finish;
      setApi({ state: 'none', file: null }, () => new Promise((resolve) => (finish = resolve)));
      const [wallpaper] = render('renderWallpaper', customConfig());
      const button = imageField(wallpaper).querySelector('button');
      button.click();
      expect(button.disabled).toBe(true);
      finish({ ok: false, error: 'CANCELLED' });
      await flush();
      expect(button.disabled).toBe(false);
    });

    it('shows a translated error linked to the button and leaves the config alone', async () => {
      const config = customConfig();
      const before = config.wallpaper.custom_background;
      setApi({ state: 'none', file: null }, async () => ({ ok: false, error: 'TOO_LARGE' }));
      const [wallpaper] = render('renderWallpaper', config);
      imageField(wallpaper).querySelector('button').click();
      await flush();
      expect(errorEl(wallpaper).textContent).toBe('settings.background_error_TOO_LARGE');
      const button = imageField(wallpaper).querySelector('button');
      expect(button.getAttribute('aria-describedby')).toBe(errorEl(wallpaper).id);
      expect(config.wallpaper.custom_background).toBe(before);
    });

    it('marks the error element as an alert', async () => {
      setApi({ state: 'none', file: null });
      const [wallpaper] = render('renderWallpaper', customConfig());
      expect(errorEl(wallpaper).getAttribute('role')).toBe('alert');
    });

    it('shows the unreadable status when the status request rejects', async () => {
      win.api = {
        backgroundStatus: async () => {
          throw new Error('ipc down');
        },
      };
      const [wallpaper] = render('renderWallpaper', customConfig());
      await flush();
      expect(statusText(wallpaper)).toContain('settings.background_status_unreadable');
    });

    it('shows nothing when the dialog is cancelled', async () => {
      setApi({ state: 'none', file: null }, async () => ({ ok: false, error: 'CANCELLED' }));
      const [wallpaper] = render('renderWallpaper', customConfig());
      imageField(wallpaper).querySelector('button').click();
      await flush();
      expect(errorEl(wallpaper).textContent).toBe('');
      expect(imageField(wallpaper).querySelector('button').hasAttribute('aria-describedby')).toBe(
        false,
      );
    });
  });

  it('hides the custom resolution field while the resolution is auto', () => {
    const config = clone(DEFAULTS);
    config.wallpaper.resolution = 'auto';
    const [wallpaper] = render('renderWallpaper', config);
    expect(field(wallpaper, 'settings.custom_resolution')).toBeUndefined();
    expect(field(wallpaper, 'settings.resolution').querySelector('select').value).toBe('auto');
  });

  it('shows the custom resolution and writes what the user types', () => {
    const config = clone(DEFAULTS);
    config.wallpaper.resolution = '2560x1440';
    const [wallpaper] = render('renderWallpaper', config);
    expect(field(wallpaper, 'settings.resolution').querySelector('select').value).toBe('custom');
    const text = field(wallpaper, 'settings.custom_resolution').querySelector('input');
    expect(text.value).toBe('2560x1440');
    setValue(text, '1920x1080');
    expect(config.wallpaper.resolution).toBe('1920x1080');
  });

  it('choosing auto resets the resolution and re-renders', () => {
    const config = clone(DEFAULTS);
    config.wallpaper.resolution = '2560x1440';
    const [wallpaper] = render('renderWallpaper', config);
    setValue(field(wallpaper, 'settings.resolution').querySelector('select'), 'auto');
    expect(config.wallpaper.resolution).toBe('auto');
    expect(rerenders).toBe(1);
  });

  it('choosing custom keeps the current resolution but still re-renders', () => {
    const config = clone(DEFAULTS);
    config.wallpaper.resolution = 'auto';
    const [wallpaper] = render('renderWallpaper', config);
    setValue(field(wallpaper, 'settings.resolution').querySelector('select'), 'custom');
    expect(config.wallpaper.resolution).toBe('auto');
    expect(rerenders).toBe(1);
  });
});

describe('renderLimiti', () => {
  it('writes the usage-band flag', () => {
    const config = clone(DEFAULTS);
    config.wallpaper.show_ai_usage = true;
    const [group] = render('renderLimiti', config);
    setChecked(field(group, 'settings.show_ai_usage').querySelector('input'), false);
    expect(config.wallpaper.show_ai_usage).toBe(false);
  });

  it('mounts the capture control in the group with the settings api and t', () => {
    const [group] = render('renderLimiti', clone(DEFAULTS));
    expect(captures).toHaveLength(1);
    expect(captures[0].api).toBe(win.api);
    expect(captures[0].container.parentNode).toBe(group);
    expect(captures[0].container.textContent).toBe('probe');
  });
});

describe('renderSidebar', () => {
  it('shows the saved position and writes edits', () => {
    const config = clone(DEFAULTS);
    config.sidebar.position = 'left';
    const [group] = render('renderSidebar', config);
    const position = field(group, 'settings.position').querySelector('select');
    expect(position.value).toBe('left');
    setValue(position, 'right');
    setValue(field(group, 'settings.width').querySelector('input'), 320);
    setValue(field(group, 'settings.opacity').querySelector('input[type="number"]'), 0.5);
    expect(config.sidebar).toMatchObject({ position: 'right', width: 320, opacity: 0.5 });
  });
});

describe('renderNotifiche', () => {
  it('writes notification settings', () => {
    const config = clone(DEFAULTS);
    const [notifications] = render('renderNotifiche', config);
    setChecked(
      field(notifications, 'settings.notifications_enabled').querySelector('input'),
      false,
    );
    setValue(
      field(notifications, 'settings.score_threshold').querySelector('input[type="number"]'),
      0.9,
    );
    setValue(field(notifications, 'settings.cooldown').querySelector('input'), 45);
    expect(config.notifications).toMatchObject({
      enabled: false,
      threshold_score: 0.9,
      cooldown_minutes: 45,
    });
  });

  it('fills a missing meeting dock block with its defaults and renders it', () => {
    const config = clone(DEFAULTS);
    delete config.meeting_dock;
    const [, dock] = render('renderNotifiche', config);
    expect(config.meeting_dock).toEqual({ enabled: true, lookahead_minutes: 10 });
    expect(field(dock, 'settings.meeting_dock_lookahead').querySelector('input').value).toBe('10');
  });

  it('writes the meeting dock settings and leaves an existing block alone', () => {
    const config = clone(DEFAULTS);
    config.meeting_dock = { enabled: false, lookahead_minutes: 5 };
    const [, dock] = render('renderNotifiche', config);
    setChecked(field(dock, 'common.enabled').querySelector('input'), true);
    setValue(field(dock, 'settings.meeting_dock_lookahead').querySelector('input'), 20);
    expect(config.meeting_dock).toEqual({ enabled: true, lookahead_minutes: 20 });
  });
});

describe('renderUI', () => {
  it('defaults the language to Italian when the config has none', () => {
    const config = clone(DEFAULTS);
    delete config.language;
    const [group] = render('renderUI', config);
    const select = field(group, 'settings.language').querySelector('select');
    expect([...select.options].map((o) => o.textContent)).toEqual(['Italiano', 'English']);
    expect(select.value).toBe('it');
  });

  it('writes language, task count, badge and countdown format', () => {
    const config = clone(DEFAULTS);
    const [group] = render('renderUI', config);
    setValue(field(group, 'settings.language').querySelector('select'), 'en');
    setValue(field(group, 'settings.max_tasks_shown').querySelector('input'), 9);
    setChecked(field(group, 'settings.source_badge').querySelector('input'), false);
    const format = field(group, 'settings.countdown_format').querySelector('select');
    expect([...format.options].map((o) => o.value)).toEqual(['relative', 'absolute', 'both']);
    setValue(format, 'both');
    expect(config.language).toBe('en');
    expect(config.ui).toMatchObject({
      max_tasks_shown: 9,
      show_source_badge: false,
      countdown_format: 'both',
    });
  });
});

'use strict';

const fs = require('fs');
const path = require('path');
const { FLYBY_ACTIONS } = require('../../core/flyby-snooze');

const html = fs.readFileSync(path.join(__dirname, '..', '..', 'renderer', 'index.html'), 'utf-8');
const itLocale = require('../../i18n/locales/it.json');
const enLocale = require('../../i18n/locales/en.json');

describe('flyby cat menu markup contract', () => {
  it('exposes the toggle and menu ids the sidebar wires', () => {
    expect(html).toContain('id="flybyToggle"');
    expect(html).toContain('id="flybyMenu"');
  });

  it('has one menu item per flyby action, in the shared order', () => {
    const actions = [...html.matchAll(/data-action="([^"]+)"/g)].map((m) => m[1]);
    expect(actions).toEqual(FLYBY_ACTIONS);
  });

  it('translates every menu action in both locales', () => {
    const keyByAction = {
      'snooze-1h': 'snooze_1h',
      'snooze-3h': 'snooze_3h',
      'snooze-24h': 'snooze_24h',
      disable: 'disable',
      reactivate: 'reactivate',
    };
    for (const action of FLYBY_ACTIONS) {
      const key = keyByAction[action];
      expect(itLocale.flyby_menu[key], `it.${key}`).toBeTruthy();
      expect(enLocale.flyby_menu[key], `en.${key}`).toBeTruthy();
    }
  });
});

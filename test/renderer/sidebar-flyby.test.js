// @vitest-environment happy-dom
'use strict';

/* global document, KeyboardEvent, window */

const { applyFlybyIcon, initFlybyToggle } = require('../../renderer/sidebar-flyby');
const { isFlybySuppressed, flybyStateKey } = require('../../renderer/sidebar-utils');

const MARKUP = `
  <button id="flybyToggle" aria-expanded="false"></button>
  <div id="flybyMenu" hidden>
    <div id="flybyMenuState"></div>
    <button class="flyby-menu-item" data-action="snooze-1h"></button>
    <button class="flyby-menu-item flyby-menu-item--reactivate" data-action="reactivate"></button>
  </div>
  <p id="outside"></p>`;
const NOW = new Date('2026-10-19T10:00:00Z').getTime();

let api;
function stubPage({ i18nReady = true, flyby = { enabled: true, snoozed_until: null } } = {}) {
  api = { setFlybyState: vi.fn(), getFlybyState: vi.fn().mockResolvedValue(null) };
  window.deadlineAura = api;
  document.body.innerHTML = MARKUP;
  vi.stubGlobal('sidebarState', { _flybyState: flyby });
  vi.stubGlobal('_i18nReady', i18nReady);
  vi.stubGlobal('t', (key, params) => (params ? `${key}|${params.time}` : key));
  vi.stubGlobal('isFlybySuppressed', isFlybySuppressed);
  vi.stubGlobal('flybyStateKey', flybyStateKey);
}
const toggle = () => document.getElementById('flybyToggle');
const menu = () => document.getElementById('flybyMenu');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  delete window.deadlineAura;
});

describe('applyFlybyIcon', () => {
  it('crosses out the cat and offers reactivation when the flyby is disabled', () => {
    stubPage({ flyby: { enabled: false, snoozed_until: null } });
    applyFlybyIcon();
    expect(toggle().classList.contains('is-snoozed')).toBe(true);
    expect(document.querySelector('.flyby-menu-item--reactivate').hidden).toBe(false);
    expect(toggle().getAttribute('aria-label')).toBe('flyby_menu.suspended');
    expect(document.getElementById('flybyMenuState').textContent).toBe(
      'flyby_menu.state_disabled|',
    );
  });

  it('shows the snooze end time while snoozed and clears the slash once it expired', () => {
    stubPage({ flyby: { enabled: true, snoozed_until: NOW + 3600_000 } });
    applyFlybyIcon();
    const text = document.getElementById('flybyMenuState').textContent;
    expect(toggle().classList.contains('is-snoozed')).toBe(true);
    expect(text).toMatch(/^flyby_menu\.state_snoozed\|.+/);
    vi.setSystemTime(NOW + 3600_001);
    applyFlybyIcon();
    expect(toggle().classList.contains('is-snoozed')).toBe(false);
    expect(document.getElementById('flybyMenuState').textContent).toMatch(
      /^flyby_menu\.state_active\|/,
    );
  });

  it('hides reactivation and labels the button active when nothing is suspended', () => {
    stubPage();
    applyFlybyIcon();
    expect(toggle().classList.contains('is-snoozed')).toBe(false);
    expect(document.querySelector('.flyby-menu-item--reactivate').hidden).toBe(true);
    expect(toggle().getAttribute('aria-label')).toBe('flyby_menu.active');
  });

  it('leaves the labels alone until i18n is ready but still toggles the slash', () => {
    stubPage({ i18nReady: false, flyby: { enabled: false, snoozed_until: null } });
    applyFlybyIcon();
    expect(toggle().classList.contains('is-snoozed')).toBe(true);
    expect(toggle().hasAttribute('aria-label')).toBe(false);
    expect(document.getElementById('flybyMenuState').textContent).toBe('');
  });

  it('tolerates a page without the state line or the cat button', () => {
    stubPage();
    document.getElementById('flybyMenuState').remove();
    applyFlybyIcon();
    expect(toggle().getAttribute('aria-label')).toBe('flyby_menu.active');
    toggle().remove();
    expect(() => applyFlybyIcon()).not.toThrow();
  });
});

describe('initFlybyToggle', () => {
  it('opens and closes the menu from the cat button, mirroring aria-expanded', () => {
    stubPage();
    initFlybyToggle();
    toggle().click();
    expect(menu().hidden).toBe(false);
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    toggle().click();
    expect(menu().hidden).toBe(true);
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
  });

  it('sends the chosen action, stores the returned state and closes the menu', async () => {
    stubPage();
    const state = { enabled: true, snoozed_until: NOW + 3600_000 };
    api.setFlybyState.mockResolvedValue({ ok: true, state });
    initFlybyToggle();
    toggle().click();
    document.querySelector('[data-action="snooze-1h"]').click();
    await vi.waitFor(() => expect(menu().hidden).toBe(true));
    expect(api.setFlybyState).toHaveBeenCalledWith('snooze-1h');
    expect(globalThis.sidebarState._flybyState).toBe(state);
    expect(toggle().classList.contains('is-snoozed')).toBe(true);
  });

  it('keeps the old state, logs the failure and still closes the menu', async () => {
    stubPage();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = globalThis.sidebarState._flybyState;
    api.setFlybyState.mockResolvedValue({ ok: false, error: 'nope' });
    initFlybyToggle();
    toggle().click();
    document.querySelector('[data-action="snooze-1h"]').click();
    await vi.waitFor(() => expect(menu().hidden).toBe(true));
    expect(globalThis.sidebarState._flybyState).toBe(before);
    expect(error).toHaveBeenCalledWith('flyby:set-state failed for action', 'snooze-1h', 'nope');
  });

  it('closes on an outside click but not on a click inside the menu', () => {
    stubPage();
    initFlybyToggle();
    toggle().click();
    menu().click();
    expect(menu().hidden).toBe(false);
    document.getElementById('outside').click();
    expect(menu().hidden).toBe(true);
  });

  it('closes on Escape and returns focus to the cat button only while open', () => {
    stubPage();
    initFlybyToggle();
    const press = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    press();
    expect(document.activeElement).not.toBe(toggle());
    toggle().click();
    press();
    expect(menu().hidden).toBe(true);
    expect(document.activeElement).toBe(toggle());
  });

  it('applies the state fetched at startup and ignores an empty answer', async () => {
    stubPage();
    const state = { enabled: false, snoozed_until: null };
    api.getFlybyState.mockResolvedValue(state);
    initFlybyToggle();
    await vi.waitFor(() => expect(globalThis.sidebarState._flybyState).toBe(state));
    expect(toggle().classList.contains('is-snoozed')).toBe(true);
  });

  it('keeps the default state when the startup fetch returns null', async () => {
    stubPage();
    const before = globalThis.sidebarState._flybyState;
    initFlybyToggle();
    await Promise.resolve();
    await Promise.resolve();
    expect(api.getFlybyState).toHaveBeenCalledTimes(1);
    expect(globalThis.sidebarState._flybyState).toBe(before);
  });

  it('does nothing without the menu markup', () => {
    stubPage();
    menu().remove();
    initFlybyToggle();
    expect(api.getFlybyState).not.toHaveBeenCalled();
  });
});

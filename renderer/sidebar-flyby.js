'use strict';

/* global t, _i18nReady, sidebarState, isFlybySuppressed, flybyStateKey */

const FLYBY_SNOOZE_TIME_FORMAT = { weekday: 'short', hour: '2-digit', minute: '2-digit' };

function renderFlybyState(toggle, suppressed, now) {
  toggle.setAttribute('aria-label', t(suppressed ? 'flyby_menu.suspended' : 'flyby_menu.active'));
  const stateEl = document.getElementById('flybyMenuState');
  if (!stateEl) {
    return;
  }
  const flyby = sidebarState._flybyState;
  const until = flyby.snoozed_until
    ? new Date(flyby.snoozed_until).toLocaleString([], FLYBY_SNOOZE_TIME_FORMAT)
    : '';
  stateEl.textContent = t(flybyStateKey(flyby, now), { time: until });
}

/**
 * Reflect the flyby state on the cat button: crossed out (is-snoozed) when the
 * flyby is suppressed (disabled or snoozed), normal otherwise. Recomputed every
 * clock tick so an expired snooze clears the slash without waiting for a config
 * broadcast.
 */
function applyFlybyIcon() {
  const toggle = document.getElementById('flybyToggle');
  if (!toggle) {
    return;
  }
  const now = Date.now();
  const suppressed = isFlybySuppressed(sidebarState._flybyState, now);
  toggle.classList.toggle('is-snoozed', suppressed);
  // "Reactivate" only makes sense when something is suspended.
  const reactivate = document.querySelector('.flyby-menu-item--reactivate');
  if (reactivate) {
    reactivate.hidden = !suppressed;
  }
  if (_i18nReady) {
    renderFlybyState(toggle, suppressed, now);
  }
}

function setFlybyMenuOpen({ toggle, menu }, open) {
  menu.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
}

async function chooseFlybyAction(action) {
  const res = await window.deadlineAura.setFlybyState(action);
  if (res && res.ok && res.state) {
    sidebarState._flybyState = res.state;
    applyFlybyIcon();
  } else {
    console.error('flyby:set-state failed for action', action, res && res.error);
  }
}

function bindFlybyMenuItems(parts) {
  parts.menu.querySelectorAll('.flyby-menu-item').forEach(function (item) {
    item.addEventListener('click', async function (e) {
      e.stopPropagation();
      await chooseFlybyAction(item.dataset.action);
      setFlybyMenuOpen(parts, false);
    });
  });
}

function bindFlybyDismissal(parts) {
  const { toggle, menu } = parts;
  document.addEventListener('click', function (e) {
    if (!menu.hidden && !menu.contains(e.target) && !toggle.contains(e.target)) {
      setFlybyMenuOpen(parts, false);
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !menu.hidden) {
      setFlybyMenuOpen(parts, false);
      toggle.focus();
    }
  });
}

// Cat button: opens a small menu to snooze/disable/reactivate the meeting flyby.
function initFlybyToggle() {
  const toggle = document.getElementById('flybyToggle');
  const menu = document.getElementById('flybyMenu');
  if (!toggle || !menu) {
    return;
  }
  const parts = { toggle, menu };

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    setFlybyMenuOpen(parts, menu.hidden);
  });
  bindFlybyMenuItems(parts);
  bindFlybyDismissal(parts);

  window.deadlineAura.getFlybyState().then(function (state) {
    if (state) {
      sidebarState._flybyState = state;
      applyFlybyIcon();
    }
  });
}

if (typeof module !== 'undefined') {
  module.exports = { applyFlybyIcon, initFlybyToggle };
}

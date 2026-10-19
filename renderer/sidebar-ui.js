'use strict';

/* Generic DOM building blocks for the sidebar: one icon set, an overflow menu and an
   undo toast. They hold no task state; sidebar.js decides what each control does. */

const ICON_PATHS = {
  check: '<path d="M3 8.5l3 3 7-7"/>',
  edit: '<path d="M3 13l1-3.5 7-7 2.5 2.5-7 7z"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5"/>',
  pin: '<path d="M6 2h4l-.8 4 2.3 2.3h-7L6.8 6zM8 8.3V14"/>',
  unpin: '<path d="M6 2h4l-.8 4 2.3 2.3h-7L6.8 6zM8 8.3V14M2 2l12 12"/>',
  clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3.3l2.2 1.4"/>',
  play: '<path class="icon-fill" d="M5 3.5v9l7.5-4.5z"/>',
  stop: '<rect class="icon-fill" x="4" y="4" width="8" height="8" rx="1"/>',
  star: '<path d="M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3l-3.7 2 .8-4.1L2 6.3l4.2-.5z"/>',
  more: '<circle class="icon-fill" cx="3.5" cy="8" r="1.2"/><circle class="icon-fill" cx="8" cy="8" r="1.2"/><circle class="icon-fill" cx="12.5" cy="8" r="1.2"/>',
  plus: '<path d="M8 3v10M3 8h10"/>',
  minus: '<path d="M3 8h10"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  chevron: '<path d="M4 6l4 4 4-4"/>',
};

/**
 * Creates an inline SVG icon from the shared set.
 *
 * @param {string} name - Key of ICON_PATHS.
 * @returns {HTMLSpanElement} Span wrapping the SVG, hidden from assistive technology.
 */
function createIcon(name) {
  const span = document.createElement('span');
  span.className = 'icon icon--' + name;
  span.setAttribute('aria-hidden', 'true');
  // ICON_PATHS holds constant markup only, never data, so innerHTML is safe here.
  span.innerHTML =
    '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    (ICON_PATHS[name] || '') +
    '</svg>';
  return span;
}

/**
 * Creates an icon-only button with an accessible name.
 *
 * @param {{icon: string, label: string, className?: string, onClick: Function}} spec - Button spec.
 * @returns {HTMLButtonElement} The button; clicks never reach the card underneath.
 */
function createIconButton(spec) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'card-btn' + (spec.className ? ' ' + spec.className : '');
  btn.title = spec.label;
  btn.setAttribute('aria-label', spec.label);
  btn.appendChild(createIcon(spec.icon));
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    spec.onClick(e);
  });
  return btn;
}

let openActionMenu = null;

function closeActionMenu() {
  if (!openActionMenu) {
    return;
  }
  openActionMenu.menu.hidden = true;
  openActionMenu.button.setAttribute('aria-expanded', 'false');
  openActionMenu = null;
}

/**
 * Creates the "more actions" button with its dropdown of labelled actions.
 *
 * @param {string} label - Accessible name of the trigger button.
 * @param {Array<{label: string, icon: string, onClick: Function, danger?: boolean}>} items - Menu entries.
 * @returns {HTMLSpanElement} Wrapper holding the trigger and the (hidden) menu.
 */
function createActionMenu(label, items) {
  const wrap = document.createElement('span');
  wrap.className = 'action-menu-wrap';

  const menu = document.createElement('div');
  menu.className = 'action-menu';
  menu.setAttribute('role', 'menu');
  menu.hidden = true;

  const button = createIconButton({
    icon: 'more',
    label: label,
    onClick: function () {
      const wasOpen = openActionMenu && openActionMenu.menu === menu;
      closeActionMenu();
      if (!wasOpen) {
        menu.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        openActionMenu = { menu: menu, button: button };
        const first = menu.querySelector('button');
        if (first) {
          first.focus();
        }
      }
    },
  });
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');

  for (const item of items) {
    const entry = document.createElement('button');
    entry.type = 'button';
    entry.setAttribute('role', 'menuitem');
    entry.className = 'action-menu-item' + (item.danger ? ' action-menu-item--danger' : '');
    entry.appendChild(createIcon(item.icon));
    entry.appendChild(document.createTextNode(item.label));
    entry.addEventListener('click', function (e) {
      e.stopPropagation();
      closeActionMenu();
      item.onClick();
    });
    menu.appendChild(entry);
  }

  wrap.appendChild(button);
  wrap.appendChild(menu);
  return wrap;
}

document.addEventListener('click', function (e) {
  if (openActionMenu && !openActionMenu.menu.parentNode.contains(e.target)) {
    closeActionMenu();
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && openActionMenu) {
    const button = openActionMenu.button;
    closeActionMenu();
    button.focus();
  }
});

/**
 * Creates the toast shown after a deletion, with its undo button.
 *
 * @param {string} message - What happened, in plain words.
 * @param {string} undoLabel - Label of the undo button.
 * @param {Function} onUndo - Called when the user presses undo.
 * @returns {HTMLDivElement} Toast element, announced politely to screen readers.
 */
function createUndoToast(message, undoLabel, onUndo) {
  const toast = document.createElement('div');
  toast.className = 'undo-toast';
  toast.setAttribute('role', 'status');
  const text = document.createElement('span');
  text.textContent = message;
  const undo = document.createElement('button');
  undo.type = 'button';
  undo.className = 'undo-toast-btn';
  undo.textContent = undoLabel;
  undo.addEventListener('click', function (e) {
    e.stopPropagation();
    onUndo();
  });
  toast.appendChild(text);
  toast.appendChild(undo);
  return toast;
}

if (typeof module !== 'undefined') {
  module.exports = {
    ICON_PATHS,
    createIcon,
    createIconButton,
    createActionMenu,
    closeActionMenu,
    createUndoToast,
  };
}

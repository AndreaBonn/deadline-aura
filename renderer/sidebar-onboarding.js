'use strict';

/* global t */

/* First-use guidance for the sidebar: shown only while there is nothing else to show. */

function createStartStep(number, title, hint, action) {
  const step = document.createElement('li');
  step.className = 'start-step';

  const badge = document.createElement('span');
  badge.className = 'start-step-n';
  badge.textContent = String(number);
  badge.setAttribute('aria-hidden', 'true');

  const body = document.createElement('div');
  body.className = 'start-step-body';
  const titleEl = document.createElement('div');
  titleEl.className = 'start-step-title';
  titleEl.textContent = title;
  const hintEl = document.createElement('div');
  hintEl.className = 'start-step-hint';
  hintEl.textContent = hint;
  body.appendChild(titleEl);
  body.appendChild(hintEl);

  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'start-step-btn';
    btn.textContent = action.label;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      action.onClick();
    });
    body.appendChild(btn);
  }

  step.appendChild(badge);
  step.appendChild(body);
  return step;
}

/**
 * Builds the "start here" card shown when the sidebar has no task at all.
 *
 * @param {{onNewTask: Function, onOpenSettings: Function}} handlers - Step actions.
 * @returns {HTMLElement} Section with the three first steps.
 */
function createStartCard(handlers) {
  const section = document.createElement('section');
  section.className = 'start-card';
  section.setAttribute('aria-labelledby', 'startCardTitle');

  const title = document.createElement('div');
  title.className = 'section-label';
  title.id = 'startCardTitle';
  title.textContent = t('sidebar.start_title');
  section.appendChild(title);

  const list = document.createElement('ol');
  list.className = 'start-steps';
  list.appendChild(
    createStartStep(1, t('sidebar.start_task'), t('sidebar.start_task_hint'), {
      label: t('sidebar.new_task'),
      onClick: handlers.onNewTask,
    }),
  );
  list.appendChild(
    createStartStep(2, t('sidebar.start_connect'), t('sidebar.start_connect_hint'), {
      label: t('sidebar.start_connect_btn'),
      onClick: handlers.onOpenSettings,
    }),
  );
  list.appendChild(createStartStep(3, t('sidebar.start_colors'), t('sidebar.start_colors_hint')));
  section.appendChild(list);
  return section;
}

if (typeof module !== 'undefined') {
  module.exports = { createStartCard };
}

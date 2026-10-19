'use strict';

/* global t, createField, createFieldGroup, createToggle, createSelect, createCheckboxGroup,
   createDateList, createTimeSlotList, createVariableMonthGrid */
/* Work shift tab. Rendered with the tab context of settings.js:
   { getConfig, defaults, api, rerender, rerenderSoon }. */

const WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6];

function ensureWorkShift(config, defaults) {
  if (!config.work_shift) {
    config.work_shift = JSON.parse(JSON.stringify(defaults.work_shift));
  }
  return config.work_shift;
}

function buildShiftEnabledField(ws, rerender) {
  return createField(
    t('settings.work_shift_enabled'),
    createToggle(ws.enabled, (v) => {
      ws.enabled = v;
      rerender();
    }),
    t('settings.work_shift_enabled_hint'),
  );
}

function buildShiftModeField(ws, rerender) {
  return createField(
    t('settings.work_shift_mode'),
    createSelect(
      ws.mode,
      [
        { value: 'regular', label: t('settings.work_shift_mode_regular') },
        { value: 'variable', label: t('settings.work_shift_mode_variable') },
      ],
      (v) => {
        ws.mode = v;
        rerender();
      },
    ),
  );
}

function buildRegularGroups(ws) {
  const regularGroup = createFieldGroup(t('settings.work_shift_work_days'));
  regularGroup.appendChild(
    createCheckboxGroup(
      ws.regular.work_days,
      WEEK_DAYS.map((d) => ({ value: d, label: t(`settings.work_shift_day_short_${d}`) })),
      (v) => {
        ws.regular.work_days = v;
      },
    ),
  );
  const slotsGroup = createFieldGroup(t('settings.work_shift_slots'));
  slotsGroup.appendChild(
    createTimeSlotList(ws.regular.slots, (v) => {
      ws.regular.slots = v;
    }),
  );
  const holidaysGroup = createFieldGroup(t('settings.work_shift_holidays'));
  holidaysGroup.appendChild(
    createDateList(ws.regular.holidays, (v) => {
      ws.regular.holidays = v;
    }),
  );
  return [regularGroup, slotsGroup, holidaysGroup];
}

function formatMonthKey(year, monthIndex) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

// The variable grid edits the current month and the next one.
function currentAndNextMonthKeys(now) {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return [
    formatMonthKey(now.getFullYear(), now.getMonth()),
    formatMonthKey(next.getFullYear(), next.getMonth()),
  ];
}

function buildVariableGroup(ws) {
  const group = createFieldGroup(t('settings.work_shift_mode_variable'));
  const hint = document.createElement('div');
  hint.className = 'field-hint';
  hint.style.marginBottom = '12px';
  hint.textContent = t('settings.work_shift_variable_hint');
  group.appendChild(hint);
  if (!ws.variable) {
    ws.variable = { months: {} };
  }
  for (const monthKey of currentAndNextMonthKeys(new Date())) {
    if (!ws.variable.months[monthKey]) {
      ws.variable.months[monthKey] = {};
    }
    group.appendChild(
      createVariableMonthGrid(monthKey, ws.variable.months[monthKey], (updated) => {
        ws.variable.months[monthKey] = updated;
      }),
    );
  }
  return group;
}

// eslint-disable-next-line no-unused-vars -- called by settings.js through the renderers table
function renderTurno(ctx) {
  const { defaults, rerender } = ctx;
  const ws = ensureWorkShift(ctx.getConfig(), defaults);
  const mainGroup = createFieldGroup(t('settings.work_shift_group'));
  mainGroup.appendChild(buildShiftEnabledField(ws, rerender));
  if (!ws.enabled) {
    return [mainGroup];
  }
  mainGroup.appendChild(buildShiftModeField(ws, rerender));
  if (ws.mode === 'regular') {
    return [mainGroup, ...buildRegularGroups(ws)];
  }
  return [mainGroup, buildVariableGroup(ws)];
}

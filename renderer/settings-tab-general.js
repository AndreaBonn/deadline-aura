'use strict';

/* global t, createField, createFieldGroup, createNumberInput, createRangeWithValue */
/* General and Advanced tabs. Rendered with the tab context of settings.js:
   { getConfig, defaults, api, rerender, rerenderSoon }. */

const PRIORITY_LABEL_KEYS = [
  'priorities.critical',
  'priorities.high',
  'priorities.medium',
  'priorities.low',
];

// eslint-disable-next-line no-unused-vars -- called by settings.js through the renderers table
function renderGenerale(ctx) {
  const { defaults } = ctx;
  const config = ctx.getConfig();
  const group = createFieldGroup(t('settings.sync_group'));
  group.append(
    createField(
      t('settings.data_interval'),
      createNumberInput(
        config.sync.data_interval_minutes || defaults.sync.data_interval_minutes,
        { min: 1, max: 60 },
        (v) => {
          config.sync.data_interval_minutes = v;
        },
      ),
      t('settings.data_interval_hint'),
    ),
    createField(
      t('settings.lookahead_window'),
      createNumberInput(config.sync.lookahead_hours, { min: 1, max: 720 }, (v) => {
        config.sync.lookahead_hours = v;
      }),
      t('settings.lookahead_hint'),
    ),
  );
  return [group];
}

function buildPriorityWeightField(config, index) {
  return createField(
    t('settings.weight_label', { label: t(PRIORITY_LABEL_KEYS[index]) }),
    createNumberInput(config.engine.priority_weights[index], { min: 0, max: 5, step: 0.1 }, (v) => {
      config.engine.priority_weights[index] = v;
    }),
  );
}

// eslint-disable-next-line no-unused-vars -- called by settings.js through the renderers table
function renderAvanzate(ctx) {
  const config = ctx.getConfig();
  const group = createFieldGroup(t('settings.engine'));
  group.append(
    createField(
      t('settings.k_constant'),
      createRangeWithValue(config.engine.k_constant, { min: 0.01, max: 1, step: 0.01 }, (v) => {
        config.engine.k_constant = v;
      }),
      t('settings.k_constant_hint'),
    ),
  );
  for (let i = 0; i < PRIORITY_LABEL_KEYS.length; i++) {
    group.appendChild(buildPriorityWeightField(config, i));
  }
  return [group];
}

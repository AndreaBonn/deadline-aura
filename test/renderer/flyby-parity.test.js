'use strict';

const { isFlybySuppressed } = require('../../renderer/sidebar-utils');
const { isFlybySuppressed: coreSuppressed } = require('../../core/flyby-snooze');

it.each([
  [{ enabled: true, snoozed_until: 101 }, true],
  [{ enabled: true, snoozed_until: 99 }, false],
  [{ enabled: true, snoozed_until: 100 }, false],
  [{ enabled: false, snoozed_until: null }, true],
  [{ enabled: true }, false],
  [{}, true],
  [{ enabled: true, snoozed_until: '101' }, false],
  [{ enabled: true, snoozed_until: NaN }, false],
  [{ enabled: true, snoozed_until: null }, false],
  [{ enabled: 'yes', snoozed_until: Infinity }, true],
  [false, true],
])('matches core suppression for %j', (state, expected) => {
  expect(coreSuppressed({ ...state, now: 100 })).toBe(expected);
  expect(isFlybySuppressed(state, 100)).toBe(expected);
});

it.each([null, undefined])('matches core rejection for absent state %j', (state) => {
  expect(() => coreSuppressed(state)).toThrow(TypeError);
  expect(() => isFlybySuppressed(state, 100)).toThrow(TypeError);
});

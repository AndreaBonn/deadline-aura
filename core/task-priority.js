'use strict';

// Task priorities run from 1 (critical) to 4 (low). A task whose source gives no usable
// priority is medium: every source falls back to the same value.
const DEFAULT_PRIORITY = 3;

module.exports = { DEFAULT_PRIORITY };

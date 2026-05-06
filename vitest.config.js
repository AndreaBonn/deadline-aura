const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    globals: true,
    root: '.',
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['core/**', 'store/**', 'ai/**', 'integrations/**'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },
  },
});

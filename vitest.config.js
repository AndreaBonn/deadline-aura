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
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
});

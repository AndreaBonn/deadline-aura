const { defineConfig } = require('vitest/config');

module.exports = defineConfig({
  test: {
    globals: true,
    root: '.',
    include: ['test/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: [
        'core/**',
        'store/**',
        'ai/**',
        'integrations/**',
        'config/**',
        'main-process/**',
        'i18n/**',
        // Sidebar and settings scripts: pure helpers are tested from Node, DOM code through
        // module tests and the happy-dom page harnesses in test/renderer/page/.
        'renderer/sidebar*.js',
        'renderer/settings*.js',
        'renderer/i18n-renderer.js',
        'renderer/shift-countdown.js',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 95,
        functions: 97,
        branches: 94,
        statements: 95,
      },
    },
  },
});

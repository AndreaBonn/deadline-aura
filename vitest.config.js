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
        'i18n/**',
        // Renderer scripts that export their pure logic for Node; the rest is DOM glue.
        'renderer/sidebar-utils.js',
        'renderer/settings-ai-capture.js',
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

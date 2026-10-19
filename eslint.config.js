const js = require('@eslint/js');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        AbortSignal: 'readonly',
        Response: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
      curly: ['error', 'all'],
    },
  },
  {
    files: ['renderer/**/*.js'],
    languageOptions: {
      globals: {
        document: 'readonly',
        window: 'readonly',
      },
    },
  },
  {
    // formatCountdown and urgencyToColor are loaded via <script src="sidebar-utils.js">
    // before sidebar.js in index.html, making them available as browser globals.
    files: ['renderer/sidebar.js'],
    languageOptions: {
      globals: {
        formatCountdown: 'readonly',
        urgencyToColor: 'readonly',
        getEventStatus: 'readonly',
      },
    },
  },
  {
    // Size limits apply to all production code. The files below predate the limits and
    // still exceed one of them: shrink this list as they are split, never grow it.
    files: ['**/*.js'],
    ignores: [
      'test/**',
      'scripts/**',
      '*.config.js',
      'ai/prompt.js',
      'ai/provider-manager.js',
      'ai/providers/anthropic.js',
      'ai/providers/gemini.js',
      'ai/providers/groq.js',
      'ai/providers/openai.js',
      'core/burnout-detector.js',
      'core/color-mapper.js',
      'core/deadline-engine.js',
      'core/display-controller.js',
      'core/ics-parser.js',
      'core/meeting-flyby.js',
      'core/postit-renderer.js',
      'core/sync-daemon.js',
      'core/wallpaper-agenda.js',
      'core/work-shift.js',
      'integrations/google-tasks.js',
      'integrations/jira.js',
      'renderer/flyby.js',
      'renderer/meeting-dock.js',
      'renderer/overlay.js',
      'renderer/settings-sections.js',
      'renderer/shift-countdown.js',
      'renderer/sidebar-onboarding.js',
      'renderer/sidebar-ui.js',
    ],
    rules: {
      'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 30, skipBlankLines: true, skipComments: true }],
      'max-params': ['error', 4],
      'max-depth': ['error', 3],
    },
  },
  {
    ignores: ['node_modules/', 'dist/', 'coverage/'],
  },
];

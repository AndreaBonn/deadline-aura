'use strict';

const DEFAULTS = {
  sync: {
    interval_minutes: 5,
    lookahead_hours: 72,
  },
  sources: {
    google_calendar: {
      enabled: true,
      calendars: ['primary'],
      priority_keywords: ['urgent', 'deadline', 'release', 'deploy', 'critico'],
    },
    jira: {
      enabled: true,
      instances: [],
      jql: 'assignee = currentUser() AND statusCategory != Done',
    },
  },
  engine: {
    k_constant: 0.05,
    priority_weights: [2.0, 1.5, 1.0, 0.5],
  },
  ai: {
    enabled: true,
    provider_priority: ['groq', 'gemini', 'openai', 'anthropic'],
    recalc_hours: 6,
    timeout_ms: 10000,
    temperature: 0.15,
  },
  wallpaper: {
    enabled: true,
    min_score_delta: 0.02,
    resolution: 'auto',
    show_text: true,
    use_backgrounds: true,
    postit: {
      enabled: true,
      max_per_display: 12,
    },
  },
  sidebar: {
    width: 260,
    position: 'right',
    opacity: 0.75,
  },
  notifications: {
    enabled: true,
    threshold_score: 0.85,
    cooldown_minutes: 30,
  },
  burnout: {
    enabled: true,
    check_interval_hours: 2,
    cooldown_hours: 24,
    stress_threshold: 7,
    consecutive_days: 3,
  },
  ui: {
    max_tasks_shown: 8,
    show_source_badge: true,
    countdown_format: 'relative',
  },
};

module.exports = { DEFAULTS };

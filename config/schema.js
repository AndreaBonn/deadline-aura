'use strict';

const { z } = require('zod');

const configSchema = z.object({
  language: z.enum(['it', 'en']).optional(),
  sync: z.object({
    interval_minutes: z.number().int().min(1).max(60),
    data_interval_minutes: z.number().int().min(1).max(60).optional(),
    lookahead_hours: z.number().int().min(1).max(720),
  }),
  sources: z.object({
    google_calendar: z.object({
      enabled: z.boolean(),
      calendars: z.array(z.string()).min(1),
      priority_keywords: z.array(z.string()),
      default_log_calendar: z.string().optional(),
      google_account: z.string().optional(),
    }),
    jira: z.object({
      enabled: z.boolean(),
      instances: z
        .array(
          z.object({
            domain: z.string(),
            email: z.string(),
            api_token: z.string(),
          }),
        )
        .optional(),
      domain: z.string().optional(),
      email: z.string().optional(),
      api_token: z.string().optional(),
      jql: z.string(),
    }),
  }),
  engine: z.object({
    k_constant: z.number().positive().max(1),
    priority_weights: z.array(z.number()).length(4),
  }),
  ai: z.object({
    enabled: z.boolean(),
    provider_priority: z.array(z.enum(['groq', 'gemini', 'openai', 'anthropic'])),
    recalc_hours: z.number().int().min(1).max(24),
    provider_timeout_ms: z.number().int().min(1000).max(30000),
    total_timeout_ms: z.number().int().min(1000).max(60000),
    temperature: z.number().min(0).max(1),
  }),
  wallpaper: z.object({
    enabled: z.boolean(),
    min_score_delta: z.number().min(0).max(0.5),
    resolution: z.union([z.literal('auto'), z.string().regex(/^\d+x\d+$/)]),
    show_text: z.boolean(),
    use_backgrounds: z.boolean(),
    postit: z.object({
      enabled: z.boolean(),
      max_per_display: z.number().int().min(1).max(20),
    }),
  }),
  sidebar: z.object({
    width: z.number().int().min(200).max(400),
    position: z.enum(['left', 'right']),
    opacity: z.number().min(0.1).max(1),
  }),
  notifications: z.object({
    enabled: z.boolean(),
    threshold_score: z.number().min(0).max(1),
    cooldown_minutes: z.number().int().min(1).max(1440),
  }),
  burnout: z
    .object({
      enabled: z.boolean(),
      check_interval_hours: z.number().int().min(1).max(24),
      cooldown_hours: z.number().int().min(1).max(168),
      stress_threshold: z.number().int().min(1).max(10),
      consecutive_days: z.number().int().min(2).max(7),
    })
    .optional(),
  meeting_dock: z
    .object({
      enabled: z.boolean(),
      lookahead_minutes: z.number().int().min(1).max(30),
    })
    .optional(),
  meeting_flyby: z
    .object({
      enabled: z.boolean(),
      trigger_seconds: z.number().int().min(10).max(300),
      duration_seconds: z.number().int().min(3).max(20),
    })
    .optional(),
  ui: z.object({
    max_tasks_shown: z.number().int().min(1).max(20),
    show_source_badge: z.boolean(),
    countdown_format: z.enum(['relative', 'absolute', 'both']),
  }),
  work_shift: z
    .object({
      enabled: z.boolean(),
      mode: z.enum(['regular', 'variable']),
      regular: z.object({
        work_days: z.array(z.number().int().min(0).max(6)),
        slots: z
          .array(
            z.object({
              start: z.string().regex(/^\d{2}:\d{2}$/),
              end: z.string().regex(/^\d{2}:\d{2}$/),
            }),
          )
          .max(4),
        holidays: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
      }),
      variable: z.object({
        months: z.record(
          z.string().regex(/^\d{4}-\d{2}$/),
          z.record(
            z.string().regex(/^\d{1,2}$/),
            z.array(
              z.object({
                start: z.string().regex(/^\d{2}:\d{2}$/),
                end: z.string().regex(/^\d{2}:\d{2}$/),
              }),
            ),
          ),
        ),
      }),
    })
    .optional(),
});

function validateConfig(config) {
  return configSchema.parse(config);
}

module.exports = { configSchema, validateConfig };

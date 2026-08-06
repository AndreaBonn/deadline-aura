const { validateConfig } = require('../../config/schema');
const { DEFAULTS } = require('../../config/defaults');

describe('config schema', () => {
  it('validates DEFAULTS config successfully', () => {
    expect(() => validateConfig(DEFAULTS)).not.toThrow();
  });

  it('rejects missing sync section', () => {
    const invalid = { ...DEFAULTS };
    delete invalid.sync;
    expect(() => validateConfig(invalid)).toThrow();
  });

  it('rejects interval_minutes below 1', () => {
    const invalid = { ...DEFAULTS, sync: { ...DEFAULTS.sync, interval_minutes: 0 } };
    expect(() => validateConfig(invalid)).toThrow();
  });

  it('rejects interval_minutes above 60', () => {
    const invalid = { ...DEFAULTS, sync: { ...DEFAULTS.sync, interval_minutes: 61 } };
    expect(() => validateConfig(invalid)).toThrow();
  });

  it('rejects invalid provider name', () => {
    const invalid = {
      ...DEFAULTS,
      ai: { ...DEFAULTS.ai, provider_priority: ['invalid_provider'] },
    };
    expect(() => validateConfig(invalid)).toThrow();
  });

  it('rejects temperature above 1', () => {
    const invalid = { ...DEFAULTS, ai: { ...DEFAULTS.ai, temperature: 1.5 } };
    expect(() => validateConfig(invalid)).toThrow();
  });

  it('rejects sidebar position other than left/right', () => {
    const invalid = { ...DEFAULTS, sidebar: { ...DEFAULTS.sidebar, position: 'top' } };
    expect(() => validateConfig(invalid)).toThrow();
  });

  it('rejects countdown_format other than allowed values', () => {
    const invalid = { ...DEFAULTS, ui: { ...DEFAULTS.ui, countdown_format: 'custom' } };
    expect(() => validateConfig(invalid)).toThrow();
  });

  it('rejects resolution format that is not auto or NxN', () => {
    const invalid = {
      ...DEFAULTS,
      wallpaper: { ...DEFAULTS.wallpaper, resolution: 'big' },
    };
    expect(() => validateConfig(invalid)).toThrow();
  });

  it('accepts valid NxN resolution format', () => {
    const valid = {
      ...DEFAULTS,
      wallpaper: { ...DEFAULTS.wallpaper, resolution: '2560x1440' },
    };
    expect(() => validateConfig(valid)).not.toThrow();
  });

  it('rejects empty calendars array', () => {
    const invalid = {
      ...DEFAULTS,
      sources: {
        ...DEFAULTS.sources,
        google_calendar: { ...DEFAULTS.sources.google_calendar, calendars: [] },
      },
    };
    expect(() => validateConfig(invalid)).toThrow();
  });

  it('rejects negative k_constant', () => {
    const invalid = {
      ...DEFAULTS,
      engine: { ...DEFAULTS.engine, k_constant: -0.1 },
    };
    expect(() => validateConfig(invalid)).toThrow();
  });

  it('rejects priority_weights with wrong length', () => {
    const invalid = {
      ...DEFAULTS,
      engine: { ...DEFAULTS.engine, priority_weights: [1.0, 2.0] },
    };
    expect(() => validateConfig(invalid)).toThrow();
  });

  it('accepts a numeric meeting_flyby.snoozed_until', () => {
    const valid = {
      ...DEFAULTS,
      meeting_flyby: { ...DEFAULTS.meeting_flyby, snoozed_until: 1_700_000_000_000 },
    };
    expect(() => validateConfig(valid)).not.toThrow();
  });

  it('accepts a null meeting_flyby.snoozed_until', () => {
    const valid = {
      ...DEFAULTS,
      meeting_flyby: { ...DEFAULTS.meeting_flyby, snoozed_until: null },
    };
    expect(() => validateConfig(valid)).not.toThrow();
  });

  it('accepts legacy meeting_flyby without snoozed_until', () => {
    const legacy = {
      ...DEFAULTS,
      meeting_flyby: { enabled: true, trigger_seconds: 60, duration_seconds: 20 },
    };
    expect(() => validateConfig(legacy)).not.toThrow();
  });

  it('rejects a non-positive meeting_flyby.snoozed_until', () => {
    const invalid = {
      ...DEFAULTS,
      meeting_flyby: { ...DEFAULTS.meeting_flyby, snoozed_until: 0 },
    };
    expect(() => validateConfig(invalid)).toThrow();
  });

  it('rejects a non-integer meeting_flyby.snoozed_until', () => {
    const invalid = {
      ...DEFAULTS,
      meeting_flyby: { ...DEFAULTS.meeting_flyby, snoozed_until: 12.5 },
    };
    expect(() => validateConfig(invalid)).toThrow();
  });

  describe('outlook source', () => {
    function withOutlook(outlook) {
      return {
        ...DEFAULTS,
        sources: { ...DEFAULTS.sources, outlook: { ...DEFAULTS.sources.outlook, ...outlook } },
      };
    }

    it('accepts an https feed url', () => {
      expect(() =>
        validateConfig(withOutlook({ ics_url: 'https://outlook.office365.com/x/cal.ics' })),
      ).not.toThrow();
    });

    it('accepts the webcal scheme Outlook hands out', () => {
      expect(() =>
        validateConfig(withOutlook({ ics_url: 'webcal://outlook.office365.com/x/cal.ics' })),
      ).not.toThrow();
    });

    it('accepts an empty feed url as not yet configured', () => {
      expect(() => validateConfig(withOutlook({ ics_url: '' }))).not.toThrow();
    });

    it('rejects a plaintext feed url', () => {
      expect(() =>
        validateConfig(withOutlook({ ics_url: 'http://example.com/cal.ics' })),
      ).toThrow();
    });

    it('loads a config written before the source existed', () => {
      const legacy = { ...DEFAULTS, sources: { ...DEFAULTS.sources } };
      delete legacy.sources.outlook;

      expect(() => validateConfig(legacy)).not.toThrow();
    });
  });
});

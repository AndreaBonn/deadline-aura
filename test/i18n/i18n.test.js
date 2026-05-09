'use strict';

const { t, setLanguage, getLanguage, getTranslations, SUPPORTED_LANGUAGES } = require('../../i18n');

describe('i18n module', () => {
  afterEach(() => {
    setLanguage('it');
  });

  describe('default language', () => {
    it('defaults to Italian', () => {
      expect(getLanguage()).toBe('it');
    });

    it('returns Italian string for known key', () => {
      expect(t('common.save')).toBe('Salva');
    });

    it('returns key when not found', () => {
      expect(t('nonexistent.key')).toBe('nonexistent.key');
    });
  });

  describe('setLanguage', () => {
    it('switches to English', () => {
      setLanguage('en');
      expect(getLanguage()).toBe('en');
      expect(t('common.save')).toBe('Save');
    });

    it('falls back to Italian for unsupported language', () => {
      setLanguage('fr');
      expect(getLanguage()).toBe('it');
      expect(t('common.save')).toBe('Salva');
    });

    it('falls back to Italian key when English translation missing', () => {
      setLanguage('en');
      expect(t('meta.dateLocale')).toBe('en-US');
    });
  });

  describe('interpolation', () => {
    it('replaces single placeholder', () => {
      expect(t('countdown.in_minutes', { n: 30 })).toBe('tra 30 minuti');
    });

    it('replaces multiple placeholders', () => {
      expect(t('settings.weight_label', { label: 'Critico' })).toBe('Peso Critico');
    });

    it('works with English locale', () => {
      setLanguage('en');
      expect(t('countdown.in_minutes', { n: 15 })).toBe('in 15 minutes');
    });
  });

  describe('getTranslations', () => {
    it('returns a deep copy of translations', () => {
      const translations = getTranslations();
      expect(translations.common.save).toBe('Salva');
      translations.common.save = 'modified';
      expect(t('common.save')).toBe('Salva');
    });
  });

  describe('SUPPORTED_LANGUAGES', () => {
    it('includes it and en', () => {
      expect(SUPPORTED_LANGUAGES).toContain('it');
      expect(SUPPORTED_LANGUAGES).toContain('en');
    });
  });

  describe('all band labels resolve', () => {
    it('returns translated band labels in Italian', () => {
      expect(t('bands.calm')).toBe('calmo');
      expect(t('bands.normal')).toBe('normale');
      expect(t('bands.attention')).toBe('attenzione');
      expect(t('bands.urgent')).toBe('urgente');
      expect(t('bands.critical')).toBe('critico');
    });

    it('returns translated band labels in English', () => {
      setLanguage('en');
      expect(t('bands.calm')).toBe('calm');
      expect(t('bands.critical')).toBe('critical');
    });
  });

  describe('countdown translations', () => {
    it('returns correct countdown strings in Italian', () => {
      expect(t('countdown.expired')).toBe('scaduto');
      expect(t('countdown.tomorrow')).toBe('domani');
      expect(t('countdown.days')).toBe('giorni');
      expect(t('countdown.days_short')).toBe('g');
    });

    it('returns correct countdown strings in English', () => {
      setLanguage('en');
      expect(t('countdown.expired')).toBe('expired');
      expect(t('countdown.tomorrow')).toBe('tomorrow');
      expect(t('countdown.days')).toBe('days');
      expect(t('countdown.days_short')).toBe('d');
    });
  });
});

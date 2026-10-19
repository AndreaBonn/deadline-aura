'use strict';

const { _i18nResolve, t, initI18n } = require('../../renderer/i18n-renderer');

describe('_i18nResolve', () => {
  it.each([
    ['nested key', { sidebar: { title: 'Tasks' } }, 'sidebar.title', 'Tasks'],
    ['missing leaf', { sidebar: {} }, 'sidebar.title', undefined],
    ['missing parent', {}, 'sidebar.title', undefined],
    ['null parent', { sidebar: null }, 'sidebar.title', undefined],
    ['empty translation', { sidebar: { title: '' } }, 'sidebar.title', ''],
    ['zero value', { count: 0 }, 'count', 0],
  ])('resolves %s', (_label, translations, key, expected) => {
    const result = _i18nResolve(translations, key);

    expect(result).toBe(expected);
  });
});

describe('t', () => {
  beforeEach(async () => {
    vi.stubGlobal('document', { querySelectorAll: () => [] });
    await initI18n({
      getTranslations: async () => ({
        sidebar: {
          title: 'Tasks',
          greeting: 'Hello {name}, {name}: {count} tasks',
          empty: '',
        },
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('translates a nested key loaded through the preload API', () => {
    const result = t('sidebar.title');

    expect(result).toBe('Tasks');
  });

  it('returns the original key when the translation is missing', () => {
    const result = t('sidebar.missing', { name: 'Ada' });

    expect(result).toBe('sidebar.missing');
  });

  it('interpolates repeated placeholders and numeric zero', () => {
    const result = t('sidebar.greeting', { name: 'Ada', count: 0 });

    expect(result).toBe('Hello Ada, Ada: 0 tasks');
  });

  it('preserves placeholders when no parameters are provided', () => {
    const result = t('sidebar.greeting');

    expect(result).toBe('Hello {name}, {name}: {count} tasks');
  });

  it('preserves placeholders for omitted parameters', () => {
    const result = t('sidebar.greeting', { name: 'Ada' });

    expect(result).toBe('Hello Ada, Ada: {count} tasks');
  });

  it('preserves an intentionally empty translation', () => {
    const result = t('sidebar.empty');

    expect(result).toBe('');
  });
});

describe('translateDom accessible names', () => {
  function fakeElement(attrs) {
    return {
      attrs: { ...attrs },
      title: attrs.title || '',
      getAttribute(name) {
        return this.attrs[name] ?? null;
      },
      hasAttribute(name) {
        return name in this.attrs;
      },
      setAttribute(name, value) {
        this.attrs[name] = value;
      },
    };
  }

  it('translates the aria-label of an icon-only button along with its title', async () => {
    const iconButton = fakeElement({ 'data-i18n-title': 'common.close', 'aria-label': 'Chiudi' });
    vi.stubGlobal('document', {
      querySelectorAll: (selector) => (selector === '[data-i18n-title]' ? [iconButton] : []),
    });

    await initI18n({ getTranslations: async () => ({ common: { close: 'Close' } }) });

    expect(iconButton.title).toBe('Close');
    expect(iconButton.attrs['aria-label']).toBe('Close');
  });

  it('does not add an aria-label to elements that only had a title', async () => {
    const labelled = fakeElement({ 'data-i18n-title': 'common.close' });
    vi.stubGlobal('document', {
      querySelectorAll: (selector) => (selector === '[data-i18n-title]' ? [labelled] : []),
    });

    await initI18n({ getTranslations: async () => ({ common: { close: 'Close' } }) });

    expect(labelled.title).toBe('Close');
    expect(labelled.hasAttribute('aria-label')).toBe(false);
  });
});

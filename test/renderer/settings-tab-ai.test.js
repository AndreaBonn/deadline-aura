// @vitest-environment happy-dom
'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const { Window } = require('happy-dom');
const { DEFAULTS } = require('../../config/defaults');

const clone = (v) => JSON.parse(JSON.stringify(v));
let win;
let rerenders;
let opened;
beforeEach(() => {
  win = new Window();
  rerenders = 0;
  opened = [];
  win.rerender = () => {
    rerenders += 1;
  };
  win.api = { openLink: (url) => opened.push(url) };
  vm.runInContext('function t(key) { return key; }', win);
  for (const file of [
    'settings-fields.js',
    'settings-helpers.js',
    'settings-sections.js',
    'settings-tab-ai.js',
  ]) {
    vm.runInContext(fs.readFileSync(`renderer/${file}`, 'utf8'), win, {
      filename: require('node:path').resolve(`renderer/${file}`),
    });
  }
});
afterEach(() => win.close());

function renderAI(config) {
  win.ctx = { getConfig: () => config, api: win.api, rerender: win.rerender };
  const groups = vm.runInContext('renderAI(window.ctx)', win);
  groups.forEach((g) => win.document.body.appendChild(g));
  return groups;
}

function aiConfig(overrides = {}) {
  const config = clone(DEFAULTS);
  Object.assign(config.ai, overrides);
  return config;
}

const change = (el) => el.dispatchEvent(new win.Event('change'));

describe('renderAI banner', () => {
  it('warns when scoring is on and no provider key is filled in', () => {
    const groups = renderAI(aiConfig({ enabled: true, api_keys: { groq: '', openai: '  ' } }));
    expect(groups).toHaveLength(3);
    expect(groups[0].querySelector('.settings-notice--warn').textContent).toBe(
      'settings.ai_off_banner',
    );
  });

  it('has no banner once one provider key is present', () => {
    const groups = renderAI(aiConfig({ enabled: true, api_keys: { groq: 'gsk_x' } }));
    expect(groups).toHaveLength(2);
    expect(win.document.querySelector('.settings-notice')).toBeNull();
  });

  it('has no banner when scoring is off, even with no keys', () => {
    renderAI(aiConfig({ enabled: false, api_keys: {} }));
    expect(win.document.querySelector('.settings-notice')).toBeNull();
  });

  it('creates the key table when the config has none', () => {
    const config = aiConfig({ enabled: false });
    delete config.ai.api_keys;
    renderAI(config);
    expect(config.ai.api_keys).toEqual({ groq: '', gemini: '', openai: '', anthropic: '' });
  });
});

describe('renderAI keys group', () => {
  it('renders one secret field per provider, filled from the config', () => {
    const config = aiConfig({ api_keys: { groq: 'k-groq', openai: 'k-oai' } });
    const groups = renderAI(config);
    const keys = groups[groups.length - 2];
    const inputs = [...keys.querySelectorAll('input[type="password"]')];
    expect(inputs.map((i) => i.value)).toEqual(['k-groq', '', 'k-oai', '']);
    expect([...keys.querySelectorAll('.field-label')].map((l) => l.firstChild.textContent)).toEqual(
      ['Groq', 'Google Gemini', 'OpenAI', 'Anthropic'],
    );
  });

  it('writes a typed key to that provider only', () => {
    const config = aiConfig({ api_keys: { groq: '', gemini: '', openai: '', anthropic: '' } });
    const groups = renderAI(config);
    const inputs = groups[groups.length - 2].querySelectorAll('input[type="password"]');
    inputs[1].value = 'AIza-new';
    change(inputs[1]);
    expect(config.ai.api_keys).toEqual({ groq: '', gemini: 'AIza-new', openai: '', anthropic: '' });
  });
});

describe('renderAI scoring group', () => {
  function scoring(config) {
    const groups = renderAI(config);
    return groups[groups.length - 1];
  }

  it('toggling the master switch writes the flag and re-renders', () => {
    const config = aiConfig({ enabled: true, api_keys: { groq: 'k' } });
    const toggle = scoring(config).querySelector('input[type="checkbox"]');
    toggle.checked = false;
    change(toggle);
    expect(config.ai.enabled).toBe(false);
    expect(rerenders).toBe(1);
  });

  it('writes the recalculation period', () => {
    const config = aiConfig({ api_keys: { groq: 'k' } });
    const hours = scoring(config).querySelector('.field input[type="number"]');
    hours.value = '6';
    change(hours);
    expect(config.ai.recalc_hours).toBe(6);
  });

  it('keeps provider priority, timeout and temperature inside a closed details block', () => {
    const config = aiConfig({ api_keys: { groq: 'k' } });
    const details = scoring(config).querySelector('details.settings-more');
    expect(details.open).toBe(false);
    expect([...details.querySelectorAll('.field-label')].map((l) => l.textContent)).toEqual([
      'settings.provider_priority',
      'settings.timeout',
      'settings.temperature',
    ]);
  });

  it('writes the timeout and the temperature', () => {
    const config = aiConfig({ api_keys: { groq: 'k' } });
    const details = scoring(config).querySelector('details');
    const [timeout, temperature] = details.querySelectorAll('input[type="number"]');
    timeout.value = '8000';
    change(timeout);
    temperature.value = '0.4';
    change(temperature);
    expect(config.ai.provider_timeout_ms).toBe(8000);
    expect(config.ai.temperature).toBe(0.4);
  });

  it('reordering the priority list writes the new order', () => {
    const config = aiConfig({ api_keys: { groq: 'k' }, provider_priority: ['groq', 'gemini'] });
    const down = scoring(config).querySelector('.priority-item .priority-btn:last-child');
    down.click();
    expect(config.ai.provider_priority).toEqual(['gemini', 'groq']);
  });
});

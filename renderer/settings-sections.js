'use strict';

/* global t, navigator */

/* DOM building blocks for the settings tabs: notices, collapsible groups, the Google
   setup guide and the AI keys header. settings.js decides where they go. */

const GOOGLE_REDIRECT_URI = 'http://localhost:34567/oauth/callback';
const GOOGLE_CONSOLE_URL = 'https://console.cloud.google.com/apis/credentials';
const COPIED_FEEDBACK_MS = 1500;

// Where each provider hands out API keys; Groq and Gemini have a free plan.
const AI_PROVIDERS = [
  { id: 'groq', label: 'Groq', free: true, keyUrl: 'https://console.groq.com/keys' },
  {
    id: 'gemini',
    label: 'Google Gemini',
    free: true,
    keyUrl: 'https://aistudio.google.com/app/apikey',
  },
  { id: 'openai', label: 'OpenAI', free: false, keyUrl: 'https://platform.openai.com/api-keys' },
  {
    id: 'anthropic',
    label: 'Anthropic',
    free: false,
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
];

/**
 * Creates an inline notice (status line under a group title).
 *
 * @param {string} text - Message in plain words.
 * @param {'warn'|'info'} kind - Visual weight.
 * @returns {HTMLDivElement} Notice element, announced politely.
 */
function createNotice(text, kind) {
  const notice = document.createElement('div');
  notice.className = 'settings-notice settings-notice--' + kind;
  notice.setAttribute('role', 'status');
  notice.textContent = text;
  return notice;
}

/**
 * Wraps secondary fields in a closed <details> block.
 *
 * @param {string} title - Summary label.
 * @param {string} hint - What is inside, shown next to the label.
 * @param {HTMLElement[]} children - Fields to tuck away.
 * @returns {HTMLDetailsElement} Collapsible block.
 */
function createCollapsible(title, hint, children) {
  const details = document.createElement('details');
  details.className = 'settings-more';
  const summary = document.createElement('summary');
  const strong = document.createElement('span');
  strong.className = 'settings-more-title';
  strong.textContent = title;
  const small = document.createElement('span');
  small.className = 'settings-more-hint';
  small.textContent = hint;
  summary.append(strong, small);
  details.appendChild(summary);
  for (const child of children) {
    details.appendChild(child);
  }
  return details;
}

function createLinkButton(label, url, api) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'link-btn link-btn--external';
  btn.textContent = label;
  btn.addEventListener('click', () => api.openLink(url));
  return btn;
}

/**
 * The three steps to create Google OAuth credentials, with a copyable redirect URI.
 *
 * @param {object} api - settingsApi (openLink).
 * @returns {HTMLOListElement} Ordered list of steps.
 */
function createGoogleSteps(api) {
  const list = document.createElement('ol');
  list.className = 'setup-steps';

  const step1 = document.createElement('li');
  step1.append(t('settings.google_steps_1') + ' ');
  step1.appendChild(createLinkButton(t('settings.google_steps_open'), GOOGLE_CONSOLE_URL, api));

  const step2 = document.createElement('li');
  step2.append(t('settings.google_steps_2') + ' ');
  const code = document.createElement('code');
  code.className = 'setup-code';
  code.textContent = GOOGLE_REDIRECT_URI;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'btn btn--secondary btn--small';
  copy.textContent = t('settings.copy');
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(GOOGLE_REDIRECT_URI);
      copy.textContent = t('settings.copied');
    } catch (err) {
      // Clipboard can be refused: select the text so a manual copy is one keystroke away.
      console.warn('clipboard write failed:', err.message);
      window.getSelection().selectAllChildren(code);
    }
    setTimeout(() => {
      copy.textContent = t('settings.copy');
    }, COPIED_FEEDBACK_MS);
  });
  step2.append(code, ' ', copy);

  const step3 = document.createElement('li');
  step3.textContent = t('settings.google_steps_3');

  list.append(step1, step2, step3);
  return list;
}

/**
 * Label block for an AI provider key: name, free badge, link to get a key.
 *
 * @param {{label: string, free: boolean, keyUrl: string}} provider - Provider entry.
 * @param {object} api - settingsApi (openLink).
 * @returns {HTMLDivElement} Element usable as the label of a field.
 */
function createProviderLabel(provider, api) {
  const wrap = document.createElement('div');
  const name = document.createElement('div');
  name.className = 'field-label';
  name.textContent = provider.label;
  if (provider.free) {
    const badge = document.createElement('span');
    badge.className = 'free-badge';
    badge.textContent = t('settings.free_plan');
    name.appendChild(badge);
  }
  wrap.appendChild(name);
  wrap.appendChild(createLinkButton(t('settings.get_key'), provider.keyUrl, api));
  return wrap;
}

if (typeof module !== 'undefined') {
  module.exports = {
    AI_PROVIDERS,
    GOOGLE_REDIRECT_URI,
    createNotice,
    createCollapsible,
    createGoogleSteps,
    createProviderLabel,
  };
}

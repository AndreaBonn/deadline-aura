'use strict';

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, 'locales');
const SUPPORTED_LANGUAGES = ['it', 'en'];
const DEFAULT_LANGUAGE = 'it';

let currentLanguage = DEFAULT_LANGUAGE;
let translations = {};
let fallbackTranslations = {};

function loadLocaleFile(lang) {
  const filePath = path.join(LOCALES_DIR, `${lang}.json`);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

function resolve(obj, keyPath) {
  const keys = keyPath.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

/**
 * Translate a key with optional interpolation params.
 *
 * @param {string} key - Dot-notation key (e.g. 'sidebar.no_tasks').
 * @param {Record<string, string|number>} [params] - Interpolation values for {placeholders}.
 * @returns {string} Translated string, or the key itself as last-resort fallback.
 */
function t(key, params) {
  let str = resolve(translations, key);
  if (str === undefined) {
    str = resolve(fallbackTranslations, key);
  }
  if (str === undefined) {
    return key;
  }
  if (params && typeof str === 'string') {
    for (const [k, v] of Object.entries(params)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}

/**
 * Set the active language and reload translations.
 *
 * @param {string} lang - Language code ('it' or 'en').
 */
function setLanguage(lang) {
  if (!SUPPORTED_LANGUAGES.includes(lang)) {
    lang = DEFAULT_LANGUAGE;
  }
  currentLanguage = lang;
  translations = loadLocaleFile(lang);
  if (lang !== DEFAULT_LANGUAGE) {
    fallbackTranslations = loadLocaleFile(DEFAULT_LANGUAGE);
  } else {
    fallbackTranslations = {};
  }
}

function getLanguage() {
  return currentLanguage;
}

function getTranslations() {
  return JSON.parse(JSON.stringify(translations));
}

// Auto-init with default language
setLanguage(DEFAULT_LANGUAGE);

module.exports = { t, setLanguage, getLanguage, getTranslations, SUPPORTED_LANGUAGES };

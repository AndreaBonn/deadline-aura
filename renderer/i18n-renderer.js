'use strict';

/* eslint-disable no-unused-vars, no-var */
/* i18n helper for renderer — loaded via <script> before other renderer scripts */

var _i18nTranslations = {};
var _i18nReady = false;

function _i18nResolve(obj, keyPath) {
  var keys = keyPath.split('.');
  var current = obj;
  for (var i = 0; i < keys.length; i++) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[keys[i]];
  }
  return current;
}

/**
 * Translate a key with optional interpolation.
 *
 * @param {string} key - Dot-notation key (e.g. 'sidebar.no_tasks').
 * @param {Record<string, string|number>} [params] - Values for {placeholder} tokens.
 * @returns {string} Translated string or the raw key as fallback.
 */
function t(key, params) {
  var str = _i18nResolve(_i18nTranslations, key);
  if (str === undefined) {
    return key;
  }
  if (params && typeof str === 'string') {
    var entries = Object.entries(params);
    for (var i = 0; i < entries.length; i++) {
      str = str.replaceAll('{' + entries[i][0] + '}', String(entries[i][1]));
    }
  }
  return str;
}

/**
 * Scan DOM for elements with data-i18n attributes and translate them.
 */
function translateDom() {
  var elements = document.querySelectorAll('[data-i18n]');
  for (var i = 0; i < elements.length; i++) {
    var key = elements[i].getAttribute('data-i18n');
    var translated = t(key);
    if (translated !== key) {
      elements[i].textContent = translated;
    }
  }
  var titleElements = document.querySelectorAll('[data-i18n-title]');
  for (var j = 0; j < titleElements.length; j++) {
    var titleKey = titleElements[j].getAttribute('data-i18n-title');
    var titleVal = t(titleKey);
    if (titleVal !== titleKey) {
      titleElements[j].title = titleVal;
    }
  }
  var phElements = document.querySelectorAll('[data-i18n-placeholder]');
  for (var k = 0; k < phElements.length; k++) {
    var phKey = phElements[k].getAttribute('data-i18n-placeholder');
    var phVal = t(phKey);
    if (phVal !== phKey) {
      phElements[k].placeholder = phVal;
    }
  }
}

/**
 * Load translations from main process and translate static DOM elements.
 *
 * @param {object} api - The preload API object exposing getTranslations().
 * @returns {Promise<void>}
 */
async function initI18n(api) {
  if (api && typeof api.getTranslations === 'function') {
    _i18nTranslations = await api.getTranslations();
  }
  _i18nReady = true;
  translateDom();
}

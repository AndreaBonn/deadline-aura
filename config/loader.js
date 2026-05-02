'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DEFAULTS } = require('./defaults');

const CONFIG_PATH = path.join(os.homedir(), '.config', 'deadlineaura', 'config.json');

function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] !== null &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...DEFAULTS };
  }

  let userConfig;
  try {
    userConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (err) {
    console.error(`Config: failed to parse ${CONFIG_PATH}: ${err.message}`);
    return { ...DEFAULTS };
  }

  return deepMerge(DEFAULTS, userConfig);
}

function saveConfig(newConfig) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
}

module.exports = { loadConfig, saveConfig, CONFIG_PATH, deepMerge };

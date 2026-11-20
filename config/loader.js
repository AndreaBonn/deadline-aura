'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DEFAULTS } = require('./defaults');
const { configSchema } = require('./schema');

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

function migrateLegacyWallpaper(userConfig) {
  const wallpaper = userConfig.wallpaper;
  if (!wallpaper || typeof wallpaper !== 'object' || Array.isArray(wallpaper)) {
    return { ...userConfig };
  }
  const { use_backgrounds: legacy, ...migrated } = wallpaper;
  if (!Object.hasOwn(wallpaper, 'background_mode') && legacy === false) {
    migrated.background_mode = 'gradient';
  }
  return { ...userConfig, wallpaper: migrated };
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

  const merged = deepMerge(DEFAULTS, migrateLegacyWallpaper(userConfig));
  const result = configSchema.safeParse(merged);
  if (!result.success) {
    const fields = result.error.flatten().fieldErrors;
    console.error('Config: invalid fields after merge, falling back to defaults:', fields);
    return { ...DEFAULTS };
  }
  return result.data;
}

function saveConfig(newConfig) {
  const dir = path.dirname(CONFIG_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), 'utf-8');
  fs.chmodSync(CONFIG_PATH, 0o600);
}

module.exports = { loadConfig, saveConfig, CONFIG_PATH, deepMerge, migrateLegacyWallpaper };

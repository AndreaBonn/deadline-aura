'use strict';

class BaseProvider {
  constructor(name, apiKeys) {
    this.name = name;
    this.apiKeys = apiKeys;
    this.currentKeyIndex = 0;
  }

  getNextKey() {
    const key = this.apiKeys[this.currentKeyIndex];
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    return key;
  }

  async score(_prompt, _options) {
    throw new Error(`${this.name}: score() not implemented`);
  }
}

module.exports = { BaseProvider };

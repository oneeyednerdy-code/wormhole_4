import test from 'node:test';
import assert from 'node:assert/strict';

import {
  OPTIONAL_HISTORY_KEYS,
  STORAGE_CHOICE_KEY,
  StorageConsent,
} from '../js/storage-consent.js';

class MemoryStorage {
  constructor(entries = []) { this.data = new Map(entries); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

test('optional history is disabled until a valid choice is saved', () => {
  const storage = new MemoryStorage();
  assert.equal(StorageConsent.getChoice(storage), null);
  assert.equal(StorageConsent.allowsLocalHistory(storage), false);
  storage.setItem(STORAGE_CHOICE_KEY, 'unexpected');
  assert.equal(StorageConsent.getChoice(storage), null);
});

test('allowing local history is remembered', () => {
  const storage = new MemoryStorage();
  StorageConsent.setChoice('history', storage);
  assert.equal(StorageConsent.getChoice(storage), 'history');
  assert.equal(StorageConsent.allowsLocalHistory(storage), true);
});

test('essential-only removes optional history without removing essential preferences', () => {
  const storage = new MemoryStorage([
    ['wormhole_viewer_history_v2', 'viewer data'],
    ['wormhole_channel_history_v1', 'channel data'],
    ['wormhole_previous_streams_v1', 'stream data'],
    ['wormhole_diagnostics_v1', 'diagnostic data'],
    ['wormhole_twitch_token', 'oauth token'],
    ['wormhole_high_contrast', 'true'],
  ]);
  StorageConsent.setChoice('essential', storage);
  assert.equal(StorageConsent.getChoice(storage), 'essential');
  for (const key of OPTIONAL_HISTORY_KEYS) assert.equal(storage.getItem(key), null);
  assert.equal(storage.getItem('wormhole_twitch_token'), 'oauth token');
  assert.equal(storage.getItem('wormhole_high_contrast'), 'true');
});

test('invalid storage choices are rejected', () => {
  const storage = new MemoryStorage();
  assert.throws(() => StorageConsent.setChoice('all', storage), TypeError);
});

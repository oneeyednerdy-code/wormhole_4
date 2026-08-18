import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CACHE_VERSION,
  RELEASE_STORAGE_KEY,
  RELEASE_VERSION,
  clearOutdatedWormholeCaches,
  ensureCurrentRelease,
} from '../js/version-check.js';

class MemoryStorage {
  constructor(entries = {}) { this.values = new Map(Object.entries(entries)); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
}

function documentFor(version = RELEASE_VERSION, cacheVersion = CACHE_VERSION) {
  return {
    baseURI: 'https://wormhole.example/',
    querySelector(selector) {
      if (selector.includes('wormhole-release')) return { content: version };
      if (selector.includes('wormhole-cache-version')) return { content: cacheVersion };
      return null;
    },
  };
}

function manifestResponse(version = RELEASE_VERSION, cacheVersion = CACHE_VERSION) {
  return {
    ok: true,
    async json() { return { version, cacheVersion }; },
  };
}

test('a current page records the release without reloading', async () => {
  const storage = new MemoryStorage();
  let replaced = null;
  const result = await ensureCurrentRelease({
    documentRef: documentFor(),
    locationRef: { href: 'https://wormhole.example/', replace: (url) => { replaced = url; } },
    storage,
    cacheStorage: { keys: async () => [], delete: async () => true },
    fetchImpl: async () => manifestResponse(),
    now: 123,
  });
  assert.equal(result.mismatch, false);
  assert.equal(replaced, null);
  assert.equal(storage.getItem(RELEASE_STORAGE_KEY), RELEASE_VERSION);
});

test('an old page clears outdated Wormhole caches and reloads with the latest version', async () => {
  const deleted = [];
  let replaced = null;
  const result = await ensureCurrentRelease({
    documentRef: documentFor('0.0.58', '58'),
    locationRef: {
      href: 'https://wormhole.example/?source=test#access_token=preserved',
      replace: (url) => { replaced = url; },
    },
    storage: new MemoryStorage({ [RELEASE_STORAGE_KEY]: '0.0.58' }),
    cacheStorage: {
      keys: async () => ['wormhole-58', 'wormhole-59', 'unrelated-cache', 'wormhole-60', 'wormhole-61', 'wormhole-62', 'wormhole-63'],
      delete: async (name) => { deleted.push(name); return true; },
    },
    fetchImpl: async () => manifestResponse('0.0.64', '64'),
  });
  assert.equal(result.reloading, true);
  assert.deepEqual(deleted.sort(), ['wormhole-58', 'wormhole-59', 'wormhole-60', 'wormhole-61', 'wormhole-62', 'wormhole-63']);
  const next = new URL(replaced);
  assert.equal(next.searchParams.get('wormhole_version'), '0.0.64');
  assert.equal(next.hash, '#access_token=preserved');
});

test('cache cleanup never removes unrelated or current caches', async () => {
  const deleted = [];
  const cleared = await clearOutdatedWormholeCaches({
    keys: async () => ['wormhole-59', 'wormhole-60', 'wormhole-61', 'wormhole-62', 'wormhole-63', 'wormhole-64', 'another-app'],
    delete: async (name) => { deleted.push(name); return true; },
  });
  assert.deepEqual(cleared, ['wormhole-59', 'wormhole-60', 'wormhole-61', 'wormhole-62', 'wormhole-63']);
  assert.deepEqual(deleted, ['wormhole-59', 'wormhole-60', 'wormhole-61', 'wormhole-62', 'wormhole-63']);
});

test('offline version checks safely use the version already loaded', async () => {
  const storage = new MemoryStorage({ [RELEASE_STORAGE_KEY]: '0.0.58' });
  const result = await ensureCurrentRelease({
    documentRef: documentFor(),
    locationRef: { href: 'https://wormhole.example/', replace: () => assert.fail('must not reload') },
    storage,
    cacheStorage: { keys: async () => [], delete: async () => true },
    fetchImpl: async () => { throw new Error('offline'); },
  });
  assert.equal(result.mismatch, false);
  assert.equal(storage.getItem(RELEASE_STORAGE_KEY), RELEASE_VERSION);
});

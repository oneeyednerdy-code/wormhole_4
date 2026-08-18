export const RELEASE_VERSION = '0.0.69';
export const CACHE_VERSION = '69';
export const RELEASE_STORAGE_KEY = 'wormhole_release_version';
export const CACHE_NAME_PREFIX = 'wormhole-';

function safeStorageGet(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

function safeStorageSet(storage, key, value) {
  try { storage?.setItem(key, value); } catch {}
}

export async function clearOutdatedWormholeCaches(
  cacheStorage,
  currentCacheName = `${CACHE_NAME_PREFIX}${CACHE_VERSION}`
) {
  if (!cacheStorage?.keys || !cacheStorage?.delete) return [];
  const names = await cacheStorage.keys();
  const outdated = names.filter((name) => (
    name.startsWith(CACHE_NAME_PREFIX) && name !== currentCacheName
  ));
  await Promise.all(outdated.map((name) => cacheStorage.delete(name)));
  return outdated;
}

async function fetchReleaseManifest(fetchImpl, baseUri, now) {
  if (typeof fetchImpl !== 'function') return null;
  try {
    const url = new URL('version.json', baseUri);
    url.searchParams.set('cache_check', String(now));
    const response = await Reflect.apply(fetchImpl, globalThis, [url.toString(), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    }]);
    if (!response.ok) return null;
    const manifest = await response.json();
    if (!/^\d+\.\d+\.\d+$/.test(manifest?.version ?? '')) return null;
    if (!/^\d+$/.test(String(manifest?.cacheVersion ?? ''))) return null;
    return {
      version: manifest.version,
      cacheVersion: String(manifest.cacheVersion),
    };
  } catch {
    return null;
  }
}

export async function ensureCurrentRelease({
  documentRef = globalThis.document,
  locationRef = globalThis.location,
  storage = globalThis.localStorage,
  cacheStorage = globalThis.caches,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
} = {}) {
  const loadedVersion = documentRef?.querySelector?.('meta[name="wormhole-release"]')?.content
    || RELEASE_VERSION;
  const loadedCacheVersion = documentRef?.querySelector?.('meta[name="wormhole-cache-version"]')?.content
    || CACHE_VERSION;
  const remote = await fetchReleaseManifest(fetchImpl, documentRef?.baseURI, now);
  const latestVersion = remote?.version || loadedVersion;
  const latestCacheVersion = remote?.cacheVersion || loadedCacheVersion;
  const recordedVersion = safeStorageGet(storage, RELEASE_STORAGE_KEY);

  let clearedCaches = [];
  if (recordedVersion !== latestVersion) {
    clearedCaches = await clearOutdatedWormholeCaches(
      cacheStorage,
      `${CACHE_NAME_PREFIX}${latestCacheVersion}`
    );
    safeStorageSet(storage, RELEASE_STORAGE_KEY, latestVersion);
  }

  const mismatch = loadedVersion !== latestVersion || loadedCacheVersion !== latestCacheVersion;
  if (!mismatch || !locationRef?.href || typeof locationRef.replace !== 'function') {
    return { mismatch, reloading: false, latestVersion, clearedCaches };
  }

  const nextUrl = new URL(locationRef.href);
  if (nextUrl.searchParams.get('wormhole_version') === latestVersion) {
    return { mismatch: true, reloading: false, latestVersion, clearedCaches };
  }
  nextUrl.searchParams.set('wormhole_version', latestVersion);
  locationRef.replace(nextUrl.toString());
  return { mismatch: true, reloading: true, latestVersion, clearedCaches };
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  ensureCurrentRelease().catch((error) => {
    console.warn('Wormhole could not verify the current release.', error);
  });
}

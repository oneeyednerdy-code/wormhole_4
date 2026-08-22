import { StorageConsent } from './storage-consent.js?v=91';

const STORAGE_KEY = 'wormhole_viewer_history_v2';
export const VIEWER_HISTORY_WINDOW_DAYS = 30;
const VIEWER_HISTORY_WINDOW_MS = VIEWER_HISTORY_WINDOW_DAYS * 86_400_000;
const MAX_SAMPLES_PER_CHANNEL = 120;
const MAX_CHANNELS = 250;
const MAX_STORAGE_BYTES = 1_500_000;
const MIN_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;
let memoryCache = null;

function confidenceLabel(sampleCount, sessionCount) {
  if (sessionCount >= 5 && sampleCount >= 15) return 'Established history';
  if (sessionCount >= 3 && sampleCount >= 8) return 'Moderate confidence';
  if (sampleCount >= 3) return 'Low confidence';
  return 'New estimate';
}

export function estimateFromSamples(
  samples,
  now = Date.now(),
  windowDays = VIEWER_HISTORY_WINDOW_DAYS
) {
  const windowMs = Math.max(1, Number(windowDays) || VIEWER_HISTORY_WINDOW_DAYS) * 86_400_000;
  const cutoff = now - windowMs;
  const valid = samples.filter((sample) => {
    const sampledAt = new Date(sample?.sampledAt).getTime();
    return Number.isFinite(sample?.viewerCount)
      && Number.isFinite(sampledAt)
      && sampledAt >= cutoff
      && sampledAt <= now;
  });
  if (!valid.length) return null;
  const sessions = new Map();
  for (const sample of valid) {
    const key = sample.streamStartedAt || String(sample.sampledAt).slice(0, 10);
    const values = sessions.get(key) ?? [];
    values.push(sample);
    sessions.set(key, values);
  }
  const sessionAverages = [...sessions.values()].map((values) => ({
    average: values.reduce((sum, sample) => sum + sample.viewerCount, 0) / values.length,
    sampledAt: Math.max(...values.map((sample) => new Date(sample.sampledAt).getTime() || 0)),
  }));
  const average = sessionAverages.reduce((sum, session) => sum + session.average, 0)
    / sessionAverages.length;
  const sampleTimes = valid.map((sample) => new Date(sample.sampledAt).getTime());
  return {
    average,
    sampleCount: valid.length,
    sessionCount: sessions.size,
    confidence: confidenceLabel(valid.length, sessions.size),
    windowDays: Math.max(1, Number(windowDays) || VIEWER_HISTORY_WINDOW_DAYS),
    firstSampleAt: new Date(Math.min(...sampleTimes)).toISOString(),
    lastSampleAt: new Date(Math.max(...sampleTimes)).toISOString(),
  };
}

/**
 * Twitch's public API exposes only a channel's current live viewer count,
 * not its historical average concurrent viewers. Wormhole records a
 * privacy-consented viewer_count sample whenever a live channel is observed
 * and calculates an equal-weighted average of stream-session averages from
 * the last 30 days. This prevents one heavily sampled stream from dominating.
 */
export const ViewerHistory = {
  _loadAll() {
    if (!StorageConsent.allowsLocalHistory()) {
      memoryCache = null;
      return {};
    }
    if (memoryCache) return memoryCache;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      memoryCache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      memoryCache = {};
    }
    return memoryCache;
  },

  _saveAll(data) {
    if (!StorageConsent.allowsLocalHistory()) return false;
    const entries = Object.entries(data)
      .filter(([, samples]) => Array.isArray(samples) && samples.length)
      .sort((a, b) => new Date(b[1].at(-1)?.sampledAt ?? 0) - new Date(a[1].at(-1)?.sampledAt ?? 0))
      .slice(0, MAX_CHANNELS);
    const pruned = Object.fromEntries(entries);
    let json = JSON.stringify(pruned);
    while (json.length > MAX_STORAGE_BYTES && entries.length > 1) {
      const [removedId] = entries.pop();
      delete pruned[removedId];
      json = JSON.stringify(pruned);
    }
    memoryCache = pruned;
    try {
      localStorage.setItem(STORAGE_KEY, json);
      return true;
    } catch {
      // Optional history must never stop discovery when storage is full or blocked.
      return false;
    }
  },

  /** Records samples no more than once every five minutes per channel. */
  recordSamples(viewerCountsByUserId) {
    if (!StorageConsent.allowsLocalHistory()) return;
    const all = this._loadAll();
    const now = Date.now();
    for (const [userId, value] of Object.entries(viewerCountsByUserId)) {
      const viewerCount = typeof value === 'number' ? value : value.viewerCount;
      if (!Number.isFinite(viewerCount) || viewerCount < 0) continue;
      const samples = all[userId] ?? [];
      const recentSamples = samples.filter((sample) => {
        const sampledAt = new Date(sample?.sampledAt).getTime();
        return Number.isFinite(sampledAt) && sampledAt >= now - VIEWER_HISTORY_WINDOW_MS;
      });
      const lastSampleAt = new Date(recentSamples.at(-1)?.sampledAt ?? 0).getTime();
      if (now - lastSampleAt < MIN_SAMPLE_INTERVAL_MS) continue;
      recentSamples.push({
        viewerCount,
        sampledAt: new Date(now).toISOString(),
        streamStartedAt: typeof value === 'object' ? value.streamStartedAt ?? null : null,
      });
      while (recentSamples.length > MAX_SAMPLES_PER_CHANNEL) recentSamples.shift();
      all[userId] = recentSamples;
    }
    this._saveAll(all);
  },

  /** Returns the rolling observed average for a channel, or null if unseen in the window. */
  getAverage(userId, { days = VIEWER_HISTORY_WINDOW_DAYS, now = Date.now() } = {}) {
    const all = this._loadAll();
    const samples = all[userId];
    if (!samples?.length) return null;
    return estimateFromSamples(samples, now, days);
  },

  getAverages(userIds, { days = VIEWER_HISTORY_WINDOW_DAYS, now = Date.now() } = {}) {
    const all = this._loadAll();
    const averages = new Map();
    for (const userId of new Set(userIds ?? [])) {
      const samples = all[userId];
      averages.set(userId, samples?.length ? estimateFromSamples(samples, now, days) : null);
    }
    return averages;
  },

  getLatestSample(userId) {
    const samples = this._loadAll()[userId];
    if (!Array.isArray(samples)) return null;
    const latest = [...samples].reverse().find((sample) => Number.isFinite(sample?.viewerCount));
    return latest ?? null;
  },

  clearAll() {
    memoryCache = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  },

  invalidateCache() {
    memoryCache = null;
  },
};

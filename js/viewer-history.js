import { StorageConsent } from './storage-consent.js?v=66';

const STORAGE_KEY = 'wormhole_viewer_history_v2';
const MAX_SAMPLES_PER_CHANNEL = 50;
const MIN_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;

function confidenceLabel(sampleCount, sessionCount) {
  if (sessionCount >= 5 && sampleCount >= 15) return 'Established history';
  if (sessionCount >= 3 && sampleCount >= 8) return 'Moderate confidence';
  if (sampleCount >= 3) return 'Low confidence';
  return 'New estimate';
}

export function estimateFromSamples(samples, now = Date.now()) {
  const valid = samples.filter((sample) => Number.isFinite(sample?.viewerCount));
  if (!valid.length) return null;
  const sessions = new Map();
  for (const sample of valid) {
    const key = sample.streamStartedAt || String(sample.sampledAt).slice(0, 10);
    const values = sessions.get(key) ?? [];
    values.push(sample);
    sessions.set(key, values);
  }
  let sessionAverages = [...sessions.values()].map((values) => ({
    average: values.reduce((sum, sample) => sum + sample.viewerCount, 0) / values.length,
    sampledAt: Math.max(...values.map((sample) => new Date(sample.sampledAt).getTime() || 0)),
  }));
  if (sessionAverages.length >= 5) {
    sessionAverages = sessionAverages
      .sort((a, b) => a.average - b.average)
      .slice(1, -1);
  }
  const weighted = sessionAverages.map((session) => {
    const ageDays = Math.max(0, now - session.sampledAt) / 86_400_000;
    return { ...session, weight: Math.max(0.1, Math.exp(-ageDays / 30)) };
  });
  const weightTotal = weighted.reduce((sum, session) => sum + session.weight, 0);
  const average = weighted.reduce(
    (sum, session) => sum + session.average * session.weight,
    0
  ) / weightTotal;
  return {
    average,
    sampleCount: valid.length,
    sessionCount: sessions.size,
    confidence: confidenceLabel(valid.length, sessions.size),
  };
}

/**
 * Twitch's public API exposes only a channel's *current* live viewer
 * count, not a historical average. To give a genuine average instead of a
 * single-moment guess, this records a viewer_count sample every time a
 * channel is seen (e.g. each time you search for raid targets), and keeps
 * a small rolling history per channel in localStorage. The more you use
 * the app, the better the "average viewers" estimate gets for channels
 * it's seen before.
 */
export const ViewerHistory = {
  _loadAll() {
    if (!StorageConsent.allowsLocalHistory()) return {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  },

  _saveAll(data) {
    if (!StorageConsent.allowsLocalHistory()) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
      const lastSampleAt = new Date(samples.at(-1)?.sampledAt ?? 0).getTime();
      if (now - lastSampleAt < MIN_SAMPLE_INTERVAL_MS) continue;
      samples.push({
        viewerCount,
        sampledAt: new Date(now).toISOString(),
        streamStartedAt: typeof value === 'object' ? value.streamStartedAt ?? null : null,
      });
      if (samples.length > MAX_SAMPLES_PER_CHANNEL) samples.shift();
      all[userId] = samples;
    }
    this._saveAll(all);
  },

  /** Returns { average, sampleCount } for a channel, or null if never seen. */
  getAverage(userId) {
    const all = this._loadAll();
    const samples = all[userId];
    if (!samples?.length) return null;
    return estimateFromSamples(samples);
  },

  getLatestSample(userId) {
    const samples = this._loadAll()[userId];
    if (!Array.isArray(samples)) return null;
    const latest = [...samples].reverse().find((sample) => Number.isFinite(sample?.viewerCount));
    return latest ?? null;
  },

  clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  },
};

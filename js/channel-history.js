import { StorageConsent } from './storage-consent.js?v=64';

const STORAGE_KEY = 'wormhole_channel_history_v1';
const MAX_CHANNELS = 300;
const MAX_SAMPLES_PER_CHANNEL = 20;
const MIN_SAMPLE_INTERVAL_MS = 12 * 60 * 60 * 1000;

function loadAll() {
  if (!StorageConsent.allowsLocalHistory()) return {};
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveAll(all) {
  if (!StorageConsent.allowsLocalHistory()) return;
  const entries = Object.entries(all)
    .sort((a, b) => new Date(b[1]?.lastSeenAt ?? 0) - new Date(a[1]?.lastSeenAt ?? 0))
    .slice(0, MAX_CHANNELS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
}

/** Local snapshots fill gaps that Twitch's API does not expose historically. */
export const ChannelHistory = {
  record(stream, followerCount, sampledAt = new Date()) {
    if (!StorageConsent.allowsLocalHistory()) return;
    if (!stream?.user_id) return;
    const all = loadAll();
    const entry = all[stream.user_id] ?? { samples: [] };
    const samples = Array.isArray(entry.samples) ? entry.samples : [];
    const last = samples.at(-1);
    const now = sampledAt.getTime();
    const lastAt = new Date(last?.sampledAt ?? 0).getTime();
    const categoryChanged = last?.gameId !== stream.game_id;

    if (!last || categoryChanged || now - lastAt >= MIN_SAMPLE_INTERVAL_MS) {
      samples.push({
        sampledAt: sampledAt.toISOString(),
        gameId: stream.game_id || null,
        gameName: stream.game_name || 'Uncategorized',
        followerCount: Number.isFinite(followerCount) ? followerCount : null,
        viewerCount: Number.isFinite(stream.viewer_count) ? stream.viewer_count : null,
      });
      if (samples.length > MAX_SAMPLES_PER_CHANNEL) samples.shift();
    } else if (Number.isFinite(followerCount) && !Number.isFinite(last.followerCount)) {
      last.followerCount = followerCount;
    }

    all[stream.user_id] = {
      displayName: stream.user_name || entry.displayName || '',
      lastSeenAt: sampledAt.toISOString(),
      samples,
    };
    saveAll(all);
  },

  getSummary(userId) {
    const entry = loadAll()[userId];
    if (!entry?.samples?.length) return null;
    const samples = entry.samples;
    const categories = [];
    for (const sample of [...samples].reverse()) {
      if (sample.gameName && !categories.includes(sample.gameName)) categories.push(sample.gameName);
    }
    const followerSamples = samples.filter((sample) => Number.isFinite(sample.followerCount));
    const first = followerSamples[0] ?? null;
    const last = followerSamples.at(-1) ?? null;
    return {
      sampleCount: samples.length,
      categories,
      firstSeenAt: samples[0].sampledAt,
      lastSeenAt: samples.at(-1).sampledAt,
      followerDelta: first && last ? last.followerCount - first.followerCount : null,
      followerStartAt: first?.sampledAt ?? null,
    };
  },

  clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  },
};

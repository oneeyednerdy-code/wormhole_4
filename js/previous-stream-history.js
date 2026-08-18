import { StorageConsent } from './storage-consent.js?v=44';

const STORAGE_KEY = 'wormhole_previous_streams_v1';
const MAX_STREAMS = 5;
const MAX_SAMPLES_PER_STREAM = 50;
const MIN_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;

/** Locally remembers stream-specific category and viewer samples. */
export const PreviousStreamHistory = {
  _load() {
    if (!StorageConsent.allowsLocalHistory()) return [];
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  _save(streams) {
    if (!StorageConsent.allowsLocalHistory()) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(streams.slice(0, MAX_STREAMS)));
  },

  record(stream) {
    if (!StorageConsent.allowsLocalHistory()) return;
    if (!stream?.id || !stream?.user_id || !stream?.game_id) return;
    const now = Date.now();
    const streams = this._load();
    const existingIndex = streams.findIndex((item) => item.streamId === stream.id);
    const existing = existingIndex >= 0 ? streams.splice(existingIndex, 1)[0] : null;
    const samples = Array.isArray(existing?.samples) ? existing.samples : [];
    const lastSampleAt = new Date(samples.at(-1)?.sampledAt ?? 0).getTime();

    if (
      Number.isFinite(stream.viewer_count) &&
      stream.viewer_count >= 0 &&
      now - lastSampleAt >= MIN_SAMPLE_INTERVAL_MS
    ) {
      samples.push({ viewerCount: stream.viewer_count, sampledAt: new Date(now).toISOString() });
      if (samples.length > MAX_SAMPLES_PER_STREAM) samples.shift();
    }

    streams.unshift({
      streamId: stream.id,
      userId: stream.user_id,
      title: stream.title || existing?.title || '',
      gameId: stream.game_id,
      gameName: stream.game_name || existing?.gameName || '',
      categorySource: 'observed',
      tags: Array.isArray(stream.tags) ? stream.tags : existing?.tags ?? [],
      startedAt: stream.started_at || existing?.startedAt || null,
      lastSeenAt: new Date(now).toISOString(),
      manualViewerBaseline: existing?.manualViewerBaseline ?? null,
      samples,
    });
    this._save(streams);
  },

  saveReference({
    streamId,
    userId,
    title,
    gameId,
    gameName,
    startedAt,
    viewerBaseline,
    categoryCleared = false,
  }) {
    if (!StorageConsent.allowsLocalHistory()) return;
    if (
      !streamId ||
      !userId ||
      (!categoryCleared && !gameId) ||
      !Number.isFinite(viewerBaseline)
    ) return;
    const streams = this._load();
    const existingIndex = streams.findIndex((item) => item.streamId === streamId);
    const existing = existingIndex >= 0 ? streams.splice(existingIndex, 1)[0] : null;
    streams.unshift({
      ...existing,
      streamId,
      userId,
      title: title || existing?.title || '',
      gameId: categoryCleared ? null : gameId,
      gameName: categoryCleared ? '' : gameName || existing?.gameName || '',
      categorySource: categoryCleared
        ? 'cleared'
        : existing?.categorySource === 'observed'
          ? 'observed'
          : 'manual',
      startedAt: startedAt || existing?.startedAt || null,
      lastSeenAt: new Date().toISOString(),
      manualViewerBaseline: viewerBaseline,
      samples: existing?.samples ?? [],
    });
    this._save(streams);
  },

  getByStreamId(streamId) {
    const stream = this._load().find((item) => item.streamId === streamId);
    if (!stream) return null;
    const validSamples = (stream.samples ?? []).filter((sample) =>
      Number.isFinite(sample?.viewerCount)
    );
    const sampledAverage = validSamples.length
      ? validSamples.reduce((sum, sample) => sum + sample.viewerCount, 0) / validSamples.length
      : null;
    const hasManualBaseline = Number.isFinite(stream.manualViewerBaseline);
    const averageViewers = hasManualBaseline ? stream.manualViewerBaseline : sampledAverage;
    return {
      ...stream,
      averageViewers,
      sampleCount: validSamples.length,
      baselineSource: hasManualBaseline ? 'manual' : sampledAverage != null ? 'observed' : null,
    };
  },

  getRecent(userId) {
    return this._load()
      .filter((stream) => stream.userId === userId)
      .map((stream) => this.getByStreamId(stream.streamId))
      .filter(Boolean);
  },

  clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  },
};

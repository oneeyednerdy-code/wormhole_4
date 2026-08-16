const STORAGE_KEY = 'raid_finder_viewer_history_v1';
const MAX_SAMPLES_PER_CHANNEL = 50;

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
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  },

  _saveAll(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },

  /** Records samples for many streams at once: { userId: viewerCount } */
  recordSamples(viewerCountsByUserId) {
    const all = this._loadAll();
    for (const [userId, viewerCount] of Object.entries(viewerCountsByUserId)) {
      const samples = all[userId] ?? [];
      samples.push(viewerCount);
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
    const average = samples.reduce((a, b) => a + b, 0) / samples.length;
    return { average, sampleCount: samples.length };
  },

  clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  },
};

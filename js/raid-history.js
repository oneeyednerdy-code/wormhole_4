const STORAGE_KEY = 'wormhole_raid_history_v1';
const MAX_ENTRIES = 50;

/**
 * There's no Twitch API endpoint that returns "who has raided me
 * recently" — Twitch only offers this as a live EventSub event
 * (channel.raid), not a queryable history. So this can only ever reflect
 * raids that happened *while this app was open and connected* (see
 * raid-listener.js) — it can't retroactively know about raids from
 * before that, even after your next login. The list builds up the more
 * you keep the app open during and after your streams.
 *
 * Entries are tagged with the broadcaster they were raiding *into*
 * (toBroadcasterId) and every read is filtered to the current logged-in
 * user, so switching Twitch accounts on the same browser doesn't leak
 * one account's raiders into another's results.
 */
export const RaidHistory = {
  _loadAll() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  },

  getAll(toBroadcasterId) {
    return this._loadAll().filter((r) => r.toBroadcasterId === toBroadcasterId);
  },

  /** Records an incoming raid. Newest first, capped at MAX_ENTRIES total. */
  record(entry) {
    const all = this._loadAll();
    all.unshift(entry);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, MAX_ENTRIES)));
  },

  /** Unique broadcaster IDs seen raiding the given user, most-recent first. */
  uniqueBroadcasterIds(toBroadcasterId) {
    return [...new Set(this.getAll(toBroadcasterId).map((r) => r.broadcasterId))];
  },

  clearAll() {
    localStorage.removeItem(STORAGE_KEY);
  },
};

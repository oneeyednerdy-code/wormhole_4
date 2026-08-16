import { TWITCH_CONFIG } from './config.js';

export class TwitchApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Wormhole's thin wrapper around Twitch's REST API. */
export class TwitchApi {
  constructor(accessToken) {
    this.accessToken = accessToken;
  }

  get headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Client-Id': TWITCH_CONFIG.clientId,
    };
  }

  async _get(path, query = {}) {
    const url = new URL(TWITCH_CONFIG.apiBaseUrl + path);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
    const res = await fetch(url, { headers: this.headers });
    if (!res.ok) {
      throw new TwitchApiError(
        `GET ${path} failed (${res.status}): ${await res.text()}`,
        res.status
      );
    }
    return res.json();
  }

  /** The logged-in user's own profile. */
  async getCurrentUser() {
    const json = await this._get('/users');
    if (!json.data?.length) throw new TwitchApiError('No user data returned for current token.');
    return json.data[0];
  }

  /** Returns the given user's current live stream, or null if offline. */
  async getLiveStreamForUser(userId) {
    const json = await this._get('/streams', { user_id: userId });
    return json.data?.[0] ?? null;
  }

  /**
   * Looks up broadcaster_type ('partner', 'affiliate', or '' for
   * non-affiliate) for a batch of user IDs. Streams returned by
   * /streams don't include this — it only lives on /users — so this is
   * a separate lookup, batched in groups of 100 (Twitch's per-request cap).
   * Returns a Map of userId -> broadcaster_type.
   */
  async getBroadcasterTypes(userIds) {
    const types = new Map();
    const uniqueIds = [...new Set(userIds)];

    for (let i = 0; i < uniqueIds.length; i += 100) {
      const batch = uniqueIds.slice(i, i + 100);
      const url = new URL(TWITCH_CONFIG.apiBaseUrl + '/users');
      batch.forEach((id) => url.searchParams.append('id', id));
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        throw new TwitchApiError(`GET /users failed (${res.status}): ${await res.text()}`);
      }
      const json = await res.json();
      for (const user of json.data ?? []) {
        types.set(user.id, user.broadcaster_type || 'none');
      }
    }

    return types;
  }

  /**
   * Returns the Twitch Team(s) a broadcaster belongs to. Twitch doesn't
   * have a "guild" concept — Teams are the closest equivalent (a named
   * group of channels, shown on each member's About page). A broadcaster
   * usually belongs to zero or one team, but the API allows for more.
   *
   * Twitch's quirk: this endpoint returns 404 (not an empty array) when
   * the broadcaster isn't on any team, so that case is normalized to [].
   */
  async getChannelTeams(broadcasterId) {
    try {
      const json = await this._get('/teams/channel', { broadcaster_id: broadcasterId });
      return json.data ?? [];
    } catch (e) {
      if (e instanceof TwitchApiError && e.status === 404) return [];
      throw e;
    }
  }

  /**
   * Looks up team memberships for many broadcasters at once. There's no
   * batch endpoint for this on Twitch's side (unlike /users), so this
   * fires individual requests with limited concurrency to stay well
   * under Twitch's rate limits rather than one giant Promise.all burst.
   * Returns a Map of userId -> array of team objects.
   */
  async getTeamMembershipsForUsers(userIds, { concurrency = 8 } = {}) {
    const results = new Map();
    const queue = [...new Set(userIds)];

    const worker = async () => {
      while (queue.length) {
        const id = queue.shift();
        results.set(id, await this.getChannelTeams(id));
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));
    return results;
  }

  /**
   * Searches Twitch's own category/game database by name (fuzzy match).
   * This is the practical stand-in for "search IGDB" from a browser-only
   * app: Twitch owns IGDB and Twitch's category IDs are sourced from it,
   * but IGDB's raw API has no CORS support and requires a client secret
   * (client_credentials grant) that can't safely live in front-end code.
   * Twitch's own /search/categories endpoint covers the same underlying
   * game database and, since it's Helix, works with the same user token
   * and CORS policy the rest of this app already relies on.
   */
  async searchCategories(query, { maxResults = 8 } = {}) {
    if (!query.trim()) return [];
    const json = await this._get('/search/categories', { query, first: maxResults });
    return json.data ?? [];
  }

  /**
   * Fetch up to maxResults currently-live streams for a game/category,
   * paginating through Twitch's cursor-based results as needed.
   */
  async getLiveStreamsByGame(gameId, { maxResults = 100, language } = {}) {
    const streams = [];
    let cursor = null;

    while (streams.length < maxResults) {
      const query = { game_id: gameId, first: 100 };
      if (language) query.language = language;
      if (cursor) query.after = cursor;

      const json = await this._get('/streams', query);
      streams.push(...(json.data ?? []));

      cursor = json.pagination?.cursor ?? null;
      if (!cursor || !json.data?.length) break;
    }

    return streams.slice(0, maxResults);
  }

  /**
   * Starts a raid from the logged-in broadcaster to toBroadcasterId.
   * Requires the channel:manage:raids scope.
   */
  async startRaid(fromBroadcasterId, toBroadcasterId) {
    const url = new URL(TWITCH_CONFIG.apiBaseUrl + '/raids');
    url.searchParams.set('from_broadcaster_id', fromBroadcasterId);
    url.searchParams.set('to_broadcaster_id', toBroadcasterId);
    const res = await fetch(url, { method: 'POST', headers: this.headers });
    if (!res.ok) {
      throw new TwitchApiError(`Failed to start raid (${res.status}): ${await res.text()}`);
    }
  }

  /** Cancels a pending raid initiated by the logged-in broadcaster. */
  async cancelRaid(fromBroadcasterId) {
    const url = new URL(TWITCH_CONFIG.apiBaseUrl + '/raids');
    url.searchParams.set('broadcaster_id', fromBroadcasterId);
    const res = await fetch(url, { method: 'DELETE', headers: this.headers });
    if (!res.ok && res.status !== 204) {
      throw new TwitchApiError(`Failed to cancel raid (${res.status}): ${await res.text()}`);
    }
  }
}

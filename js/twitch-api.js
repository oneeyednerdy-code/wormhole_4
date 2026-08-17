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
    this.broadcasterTypeCache = new Map();
    this.teamCache = new Map();
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

  /** Channel metadata, including the broadcaster's current or last-played category. */
  async getChannelInformation(broadcasterId) {
    const json = await this._get('/channels', { broadcaster_id: broadcasterId });
    return json.data?.[0] ?? null;
  }

  /** The broadcaster's newest published past-broadcast VODs. */
  async getRecentArchives(userId, { maxResults = 5 } = {}) {
    const json = await this._get('/videos', {
      user_id: userId,
      type: 'archive',
      sort: 'time',
      first: Math.min(Math.max(maxResults, 1), 100),
    });
    return (json.data ?? []).slice(0, maxResults);
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
    const uncachedIds = uniqueIds.filter((id) => {
      if (!this.broadcasterTypeCache.has(id)) return true;
      types.set(id, this.broadcasterTypeCache.get(id));
      return false;
    });

    for (let i = 0; i < uncachedIds.length; i += 100) {
      const batch = uncachedIds.slice(i, i + 100);
      const url = new URL(TWITCH_CONFIG.apiBaseUrl + '/users');
      batch.forEach((id) => url.searchParams.append('id', id));
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        throw new TwitchApiError(
          `GET /users failed (${res.status}): ${await res.text()}`,
          res.status
        );
      }
      const json = await res.json();
      for (const user of json.data ?? []) {
        const type = user.broadcaster_type || 'none';
        types.set(user.id, type);
        this.broadcasterTypeCache.set(user.id, type);
      }
      for (const id of batch) {
        if (!types.has(id)) {
          types.set(id, 'none');
          this.broadcasterTypeCache.set(id, 'none');
        }
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
    if (this.teamCache.has(broadcasterId)) return this.teamCache.get(broadcasterId);
    try {
      const json = await this._get('/teams/channel', { broadcaster_id: broadcasterId });
      const teams = json.data ?? [];
      this.teamCache.set(broadcasterId, teams);
      return teams;
    } catch (e) {
      if (e instanceof TwitchApiError && e.status === 404) {
        this.teamCache.set(broadcasterId, []);
        return [];
      }
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
  async getLiveStreamsByGame(
    gameId,
    { maxResults = 100, language, stopBelowViewers = null } = {}
  ) {
    const streams = [];
    let cursor = null;

    while (streams.length < maxResults) {
      const query = { game_id: gameId, first: 100 };
      if (language) query.language = language;
      if (cursor) query.after = cursor;

      const json = await this._get('/streams', query);
      streams.push(...(json.data ?? []));

      const lastViewerCount = json.data?.at(-1)?.viewer_count;
      if (
        stopBelowViewers != null &&
        Number.isFinite(lastViewerCount) &&
        lastViewerCount < stopBelowViewers
      ) {
        break;
      }

      cursor = json.pagination?.cursor ?? null;
      if (!cursor || !json.data?.length) break;
    }

    return streams.slice(0, maxResults);
  }

  /**
   * Currently-live streams among the channels the logged-in user follows.
   * Requires the user:read:follows scope. Uses Twitch's dedicated
   * /streams/followed endpoint (rather than fetching the full follow list
   * and cross-referencing /streams), since Twitch already does that join
   * server-side and returns only the ones that are live, pre-sorted by
   * viewer count.
   */
  async getFollowedLiveStreams(userId, { maxResults = 100 } = {}) {
    const streams = [];
    let cursor = null;

    while (streams.length < maxResults) {
      const query = { user_id: userId, first: 100 };
      if (cursor) query.after = cursor;

      const json = await this._get('/streams/followed', query);
      streams.push(...(json.data ?? []));

      cursor = json.pagination?.cursor ?? null;
      if (!cursor || !json.data?.length) break;
    }

    return streams.slice(0, maxResults);
  }

  /**
   * Creates an EventSub subscription over an already-open WebSocket
   * session (see raid-listener.js). channel.raid needs no special scope
   * beyond a valid user token when using the WebSocket transport.
   */
  async createEventSubWebSocketSubscription(type, version, condition, sessionId) {
    const url = new URL(TWITCH_CONFIG.apiBaseUrl + '/eventsub/subscriptions');
    const res = await fetch(url, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        version,
        condition,
        transport: { method: 'websocket', session_id: sessionId },
      }),
    });
    if (!res.ok) {
      throw new TwitchApiError(
        `Failed to create EventSub subscription (${res.status}): ${await res.text()}`,
        res.status
      );
    }
    return res.json();
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
      throw new TwitchApiError(
        `Failed to start raid (${res.status}): ${await res.text()}`,
        res.status
      );
    }
  }

  /** Cancels a pending raid initiated by the logged-in broadcaster. */
  async cancelRaid(fromBroadcasterId) {
    const url = new URL(TWITCH_CONFIG.apiBaseUrl + '/raids');
    url.searchParams.set('broadcaster_id', fromBroadcasterId);
    const res = await fetch(url, { method: 'DELETE', headers: this.headers });
    if (!res.ok && res.status !== 204) {
      throw new TwitchApiError(
        `Failed to cancel raid (${res.status}): ${await res.text()}`,
        res.status
      );
    }
  }
}

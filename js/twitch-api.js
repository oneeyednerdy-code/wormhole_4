import { TWITCH_CONFIG } from './config.js?v=44';
import { RequestError, RequestManager } from './request-manager.js?v=44';

function normalizeGameName(name) {
  return String(name ?? '')
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export class TwitchApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Wormhole's thin wrapper around Twitch's REST API. */
export class TwitchApi {
  constructor(accessToken, { requestManager } = {}) {
    this.accessToken = accessToken;
    this.requestManager = requestManager ?? new RequestManager();
    this.broadcasterTypeCache = new Map();
    this.teamCache = new Map();
    this.followedBroadcasterIdsCache = new Map();
    this.followedAtCache = new Map();
    this.followerCountCache = new Map();
    this.userProfileCache = new Map();
    this.broadcastHistoryCache = new Map();
    this.clipHistoryCache = new Map();
    this.scheduleCache = new Map();
    this.gameNameCache = new Map();
  }

  get headers() {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Client-Id': TWITCH_CONFIG.clientId,
    };
  }

  async _request(url, options = {}, requestOptions = {}) {
    try {
      return await this.requestManager.request(url, options, requestOptions);
    } catch (error) {
      if (error instanceof RequestError) {
        throw new TwitchApiError(
          `${options.method ?? 'GET'} ${new URL(url, globalThis.location?.origin ?? 'http://localhost').pathname} failed (${error.status}): ${error.body}`,
          error.status
        );
      }
      throw error;
    }
  }

  async _protectedAction(action, payload) {
    return this._request('/api/raid-action', {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...payload }),
    }, { retries: 0 });
  }

  async _get(path, query = {}, { signal } = {}) {
    const url = new URL(TWITCH_CONFIG.apiBaseUrl + path);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    }
    const res = await this._request(url, { headers: this.headers }, { signal });
    return res.json();
  }

  /** The logged-in user's own profile. */
  async getCurrentUser() {
    const json = await this._get('/users');
    if (!json.data?.length) throw new TwitchApiError('No user data returned for current token.');
    return json.data[0];
  }

  /** Resolves an exact Twitch login to its public user profile. */
  async getUserByLogin(login) {
    const normalized = String(login ?? '').trim().toLowerCase();
    if (!normalized) return null;
    const json = await this._get('/users', { login: normalized });
    const user = json.data?.[0] ?? null;
    if (user) {
      this.userProfileCache.set(user.id, user);
      this.broadcasterTypeCache.set(user.id, user.broadcaster_type || 'none');
    }
    return user;
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
  async getBroadcasterTypes(userIds, { signal } = {}) {
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
      const res = await this._request(url, { headers: this.headers }, { signal });
      const json = await res.json();
      for (const user of json.data ?? []) {
        const type = user.broadcaster_type || 'none';
        types.set(user.id, type);
        this.broadcasterTypeCache.set(user.id, type);
        this.userProfileCache.set(user.id, user);
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

  /** Returns cached profile metadata, including account creation date. */
  async getBroadcasterProfile(userId) {
    if (this.userProfileCache.has(userId)) return this.userProfileCache.get(userId);
    const json = await this._get('/users', { id: userId });
    const profile = json.data?.[0] ?? null;
    if (profile) {
      this.userProfileCache.set(userId, profile);
      this.broadcasterTypeCache.set(userId, profile.broadcaster_type || 'none');
    }
    return profile;
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
  async getChannelTeams(broadcasterId, { signal } = {}) {
    if (this.teamCache.has(broadcasterId)) return this.teamCache.get(broadcasterId);
    try {
      const json = await this._get('/teams/channel', { broadcaster_id: broadcasterId }, { signal });
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
  async getTeamMembershipsForUsers(userIds, { concurrency = 8, signal } = {}) {
    const results = new Map();
    const queue = [...new Set(userIds)];

    const worker = async () => {
      while (queue.length) {
        const id = queue.shift();
        results.set(id, await this.getChannelTeams(id, { signal }));
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
   * Twitch's /games and /search/categories endpoints cover the same underlying
   * game database and, since they're Helix, work with the same user token and
   * CORS policy the rest of this app already relies on.
   */
  async searchCategories(query, { maxResults = 20 } = {}) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return [];
    const limit = Math.min(Math.max(maxResults, 1), 100);

    // Twitch exposes fuzzy category search and exact-name game lookup as
    // separate endpoints. Query both so a valid exact category is not omitted
    // merely because it fell outside the fuzzy endpoint's first result page.
    const [exactResult, fuzzyResult] = await Promise.allSettled([
      this.getGamesByNames([trimmedQuery]),
      this._get('/search/categories', { query: trimmedQuery, first: limit }),
    ]);
    if (exactResult.status === 'rejected' && fuzzyResult.status === 'rejected') {
      throw fuzzyResult.reason;
    }

    const exact = exactResult.status === 'fulfilled' ? exactResult.value : [];
    const fuzzy = fuzzyResult.status === 'fulfilled' ? fuzzyResult.value.data ?? [] : [];
    const seen = new Set();
    return [...exact, ...fuzzy]
      .filter((category) => {
        if (!category?.id || seen.has(category.id)) return false;
        seen.add(category.id);
        return true;
      })
      .slice(0, limit);
  }

  /** Resolves exact Twitch category names in URL-safe batches. */
  async getGamesByNames(names, { signal } = {}) {
    const requested = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
    const missing = requested.filter((name) => !this.gameNameCache.has(normalizeGameName(name)));

    for (let i = 0; i < missing.length; i += 20) {
      const batch = missing.slice(i, i + 20);
      const url = new URL(TWITCH_CONFIG.apiBaseUrl + '/games');
      batch.forEach((name) => url.searchParams.append('name', name));
      const res = await this._request(url, { headers: this.headers }, { signal });
      const json = await res.json();
      const returned = new Map(
        (json.data ?? []).map((game) => [normalizeGameName(game.name), game])
      );
      for (const name of batch) {
        const key = normalizeGameName(name);
        this.gameNameCache.set(key, returned.get(key) ?? null);
      }
    }

    return requested
      .map((name) => this.gameNameCache.get(normalizeGameName(name)))
      .filter(Boolean);
  }

  /**
   * Resolves genre preset names with exact batched lookup first, then a
   * limited-concurrency category search for Twitch naming variations.
   */
  async resolveGenreCategories(names, { concurrency = 4 } = {}) {
    const requested = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
    try {
      await this.getGamesByNames(requested);
    } catch (error) {
      console.error(error);
    }
    const unresolvedQueue = requested.filter(
      (name) => !this.gameNameCache.get(normalizeGameName(name))
    );

    const worker = async () => {
      while (unresolvedQueue.length) {
        const requestedName = unresolvedQueue.shift();
        const requestedKey = normalizeGameName(requestedName);
        try {
          const results = await this.searchCategories(requestedName, { maxResults: 5 });
          const match = results.find((game) => {
            const candidateKey = normalizeGameName(game.name);
            return candidateKey === requestedKey ||
              candidateKey.includes(requestedKey) ||
              requestedKey.includes(candidateKey);
          }) ?? null;
          if (match) this.gameNameCache.set(requestedKey, match);
        } catch (error) {
          console.error(error);
        }
      }
    };

    await Promise.all(
      Array.from(
        { length: Math.min(concurrency, unresolvedQueue.length) },
        () => worker()
      )
    );

    const games = requested
      .map((name) => this.gameNameCache.get(normalizeGameName(name)))
      .filter(Boolean);
    const unresolved = requested.filter(
      (name) => !this.gameNameCache.get(normalizeGameName(name))
    );
    return { games, unresolved };
  }

  /**
   * Fetch up to maxResults currently-live streams for a game/category,
   * paginating through Twitch's cursor-based results as needed.
   */
  async getLiveStreamsByGame(
    gameId,
    { maxResults = 100, language, stopBelowViewers = null, signal } = {}
  ) {
    const streams = [];
    let cursor = null;

    while (streams.length < maxResults) {
      const query = { game_id: gameId, first: 100 };
      if (language) query.language = language;
      if (cursor) query.after = cursor;

      const json = await this._get('/streams', query, { signal });
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

  /** Fetches currently-live streams across all categories. */
  async getLiveStreams(
    { maxResults = 100, language, stopBelowViewers = null, signal } = {}
  ) {
    const streams = [];
    let cursor = null;

    while (streams.length < maxResults) {
      const query = { first: 100 };
      if (language) query.language = language;
      if (cursor) query.after = cursor;

      const json = await this._get('/streams', query, { signal });
      streams.push(...(json.data ?? []));
      const lastViewerCount = json.data?.at(-1)?.viewer_count;
      if (
        stopBelowViewers != null &&
        Number.isFinite(lastViewerCount) &&
        lastViewerCount < stopBelowViewers
      ) break;
      cursor = json.pagination?.cursor ?? null;
      if (!cursor || !json.data?.length) break;
    }

    return streams.slice(0, maxResults);
  }

  /**
   * Fetches every currently-live channel followed by the logged-in user.
   * Twitch returns at most 100 streams per page, so continue until its cursor
   * is exhausted instead of applying the general discovery result cap.
   */
  async getFollowedLiveStreams(userId, { signal } = {}) {
    const streams = [];
    const seen = new Set();
    let cursor = null;

    do {
      const query = { user_id: userId, first: 100 };
      if (cursor) query.after = cursor;

      const json = await this._get('/streams/followed', query, { signal });
      for (const stream of json.data ?? []) {
        if (!stream.user_id || seen.has(stream.user_id)) continue;
        seen.add(stream.user_id);
        streams.push(stream);
      }
      cursor = json.pagination?.cursor ?? null;
    } while (cursor);

    return streams;
  }

  /** Fetches live streams matching any of up to 100 category IDs. */
  async getLiveStreamsByGames(
    gameIds,
    { maxResults = 100, language, stopBelowViewers = null, signal } = {}
  ) {
    const ids = [...new Set(gameIds)].slice(0, 100);
    if (!ids.length) return [];
    const streams = [];
    let cursor = null;

    while (streams.length < maxResults) {
      const url = new URL(TWITCH_CONFIG.apiBaseUrl + '/streams');
      ids.forEach((id) => url.searchParams.append('game_id', id));
      url.searchParams.set('first', '100');
      if (language) url.searchParams.set('language', language);
      if (cursor) url.searchParams.set('after', cursor);

      const res = await this._request(url, { headers: this.headers }, { signal });
      const json = await res.json();
      streams.push(...(json.data ?? []));
      const lastViewerCount = json.data?.at(-1)?.viewer_count;
      if (
        stopBelowViewers != null &&
        Number.isFinite(lastViewerCount) &&
        lastViewerCount < stopBelowViewers
      ) break;
      cursor = json.pagination?.cursor ?? null;
      if (!cursor || !json.data?.length) break;
    }

    return streams.slice(0, maxResults);
  }

  /**
   * Returns the broadcaster IDs followed by the logged-in user. Twitch caps
   * each page at 100, so the cursor is followed until the list is complete.
   * The in-flight promise is cached per user so repeated searches only load
   * the follow list once during this browser session.
   */
  async getFollowedBroadcasterIds(userId, { signal } = {}) {
    if (this.followedBroadcasterIdsCache.has(userId)) {
      return this.followedBroadcasterIdsCache.get(userId);
    }

    const request = (async () => {
      const ids = new Set();
      let cursor = null;

      do {
        const query = { user_id: userId, first: 100 };
        if (cursor) query.after = cursor;

        const json = await this._get('/channels/followed', query, { signal });
        for (const follow of json.data ?? []) {
          if (follow.broadcaster_id) {
            ids.add(follow.broadcaster_id);
            this.followedAtCache.set(follow.broadcaster_id, follow.followed_at ?? null);
          }
        }

        cursor = json.pagination?.cursor ?? null;
      } while (cursor);

      return ids;
    })();

    this.followedBroadcasterIdsCache.set(userId, request);
    try {
      return await request;
    } catch (error) {
      this.followedBroadcasterIdsCache.delete(userId);
      throw error;
    }
  }

  getFollowedAt(broadcasterId) {
    return this.followedAtCache.get(broadcasterId) ?? null;
  }

  /**
   * Returns a channel's public follower total. Twitch may omit individual
   * follower records when the logged-in user is not that channel's moderator,
   * but the response still includes the public `total` value.
   */
  async getFollowerCount(broadcasterId) {
    if (this.followerCountCache.has(broadcasterId)) {
      return this.followerCountCache.get(broadcasterId);
    }

    const request = this._get('/channels/followers', {
      broadcaster_id: broadcasterId,
      first: 1,
    }).then((json) => {
      const total = Number(json.total);
      return Number.isFinite(total) ? total : null;
    });

    this.followerCountCache.set(broadcasterId, request);
    try {
      return await request;
    } catch (error) {
      this.followerCountCache.delete(broadcasterId);
      throw error;
    }
  }

  /** Loads follower totals with limited concurrency to protect rate limits. */
  async getFollowerCountsForUsers(userIds, { concurrency = 8 } = {}) {
    const results = new Map();
    const queue = [...new Set(userIds)];

    const worker = async () => {
      while (queue.length) {
        const id = queue.shift();
        try {
          results.set(id, await this.getFollowerCount(id));
        } catch (error) {
          console.error(error);
          results.set(id, null);
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, queue.length) }, () => worker())
    );
    return results;
  }

  /** Public past broadcasts from the last N days, newest first. */
  async getBroadcastHistory(userId, { days = 30, maxResults = 100 } = {}) {
    const key = `${userId}:${days}:${maxResults}`;
    if (this.broadcastHistoryCache.has(key)) return this.broadcastHistoryCache.get(key);

    const request = this._get('/videos', {
      user_id: userId,
      type: 'archive',
      sort: 'time',
      first: Math.min(Math.max(maxResults, 1), 100),
    }).then((json) => {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      return (json.data ?? []).filter(
        (video) => new Date(video.created_at).getTime() >= cutoff
      );
    });

    this.broadcastHistoryCache.set(key, request);
    return request;
  }

  /** Most-viewed clips created during the last N days. */
  async getRecentClips(userId, { days = 30, maxResults = 3 } = {}) {
    const key = `${userId}:${days}:${maxResults}`;
    if (this.clipHistoryCache.has(key)) return this.clipHistoryCache.get(key);
    const endedAt = new Date();
    const startedAt = new Date(endedAt.getTime() - days * 24 * 60 * 60 * 1000);
    const request = this._get('/clips', {
      broadcaster_id: userId,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
      first: Math.min(Math.max(maxResults, 1), 100),
    }).then((json) => json.data ?? []);
    this.clipHistoryCache.set(key, request);
    return request;
  }

  /** Current and next published schedule segments, when available. */
  async getScheduleContext(userId) {
    if (this.scheduleCache.has(userId)) return this.scheduleCache.get(userId);
    const now = new Date();
    const lookback = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const request = this._get('/schedule', {
      broadcaster_id: userId,
      start_time: lookback.toISOString(),
      first: 25,
    })
      .then((json) => {
        const segments = (json.data?.segments ?? []).filter(
          (segment) => !segment.canceled_until
        );
        const nowMs = now.getTime();
        return {
          current: segments.find((segment) => {
            const start = new Date(segment.start_time).getTime();
            const end = new Date(segment.end_time).getTime();
            return start <= nowMs && end > nowMs;
          }) ?? null,
          next: segments.find(
            (segment) => new Date(segment.start_time).getTime() > nowMs
          ) ?? null,
        };
      })
      .catch((error) => {
        if (error instanceof TwitchApiError && error.status === 404) {
          return { current: null, next: null };
        }
        throw error;
      });
    this.scheduleCache.set(userId, request);
    return request;
  }

  async getNextScheduledStream(userId) {
    return (await this.getScheduleContext(userId)).next;
  }

  /**
   * Creates an EventSub subscription over an already-open WebSocket
   * session (see raid-listener.js). channel.raid needs no special scope
   * beyond a valid user token when using the WebSocket transport.
   */
  async createEventSubWebSocketSubscription(type, version, condition, sessionId) {
    const url = new URL(TWITCH_CONFIG.apiBaseUrl + '/eventsub/subscriptions');
    const res = await this._request(url, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type,
        version,
        condition,
        transport: { method: 'websocket', session_id: sessionId },
      }),
    });
    return res.json();
  }

  /**
   * Starts a raid from the logged-in broadcaster to toBroadcasterId.
   * Requires the channel:manage:raids scope.
   */
  async startRaid(fromBroadcasterId, toBroadcasterId) {
    if (TWITCH_CONFIG.backendActions) {
      const response = await this._protectedAction('start', { fromBroadcasterId, toBroadcasterId });
      const json = await response.json();
      return json.data?.[0] ?? null;
    }
    const url = new URL(TWITCH_CONFIG.apiBaseUrl + '/raids');
    url.searchParams.set('from_broadcaster_id', fromBroadcasterId);
    url.searchParams.set('to_broadcaster_id', toBroadcasterId);
    const res = await this._request(url, { method: 'POST', headers: this.headers });
    const json = await res.json();
    return json.data?.[0] ?? null;
  }

  /** Sends a chat message as the logged-in user. Requires user:write:chat. */
  async sendChatMessage(broadcasterId, senderId, message) {
    if (TWITCH_CONFIG.backendActions) {
      const response = await this._protectedAction('chat', { broadcasterId, senderId, message });
      const json = await response.json();
      return json.data?.[0] ?? { is_sent: false, drop_reason: { message: 'Twitch did not return a delivery result.' } };
    }
    const url = new URL(TWITCH_CONFIG.apiBaseUrl + '/chat/messages');
    const res = await this._request(url, {
      method: 'POST',
      headers: { ...this.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        broadcaster_id: broadcasterId,
        sender_id: senderId,
        message,
      }),
    });
    const json = await res.json();
    return json.data?.[0] ?? { is_sent: false, drop_reason: { message: 'Twitch did not return a delivery result.' } };
  }

  /** Cancels a pending raid initiated by the logged-in broadcaster. */
  async cancelRaid(fromBroadcasterId) {
    if (TWITCH_CONFIG.backendActions) {
      await this._protectedAction('cancel', { fromBroadcasterId });
      return;
    }
    const url = new URL(TWITCH_CONFIG.apiBaseUrl + '/raids');
    url.searchParams.set('broadcaster_id', fromBroadcasterId);
    await this._request(url, { method: 'DELETE', headers: this.headers });
  }
}

import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  location: { origin: 'https://wormhole.example', pathname: '/' },
};

const { TwitchApi } = await import('../js/twitch-api.js');

test('resolves an exact streamer login through Twitch users', async () => {
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = new URL(url);
    return {
      ok: true,
      async json() {
        return { data: [{ id: 'streamer-1', login: 'example', display_name: 'Example', broadcaster_type: 'affiliate' }] };
      },
    };
  };
  const api = new TwitchApi('test-token');
  const user = await api.getUserByLogin('Example');
  assert.equal(user.id, 'streamer-1');
  assert.equal(requestedUrl.pathname, '/helix/users');
  assert.equal(requestedUrl.searchParams.get('login'), 'example');
});

test('loads content classification labels from channel information in batches', async () => {
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    const requestedUrl = new URL(url);
    requestedUrls.push(requestedUrl);
    const ids = requestedUrl.searchParams.getAll('broadcaster_id');
    return {
      ok: true,
      async json() {
        return {
          data: ids.map((id) => ({
            broadcaster_id: id,
            content_classification_labels: id === 'channel-1'
              ? ['DebatedSocialIssuesAndPolitics', 'ProfanityVulgarity']
              : [],
          })),
        };
      },
    };
  };

  const api = new TwitchApi('test-token');
  const ids = Array.from({ length: 101 }, (_, index) => `channel-${index + 1}`);
  const channels = await api.getChannelInformationForUsers(ids);

  assert.equal(requestedUrls.length, 2);
  assert.equal(requestedUrls[0].pathname, '/helix/channels');
  assert.equal(requestedUrls[0].searchParams.getAll('broadcaster_id').length, 100);
  assert.equal(requestedUrls[1].searchParams.getAll('broadcaster_id').length, 1);
  assert.deepEqual(channels.get('channel-1').content_classification_labels, [
    'DebatedSocialIssuesAndPolitics',
    'ProfanityVulgarity',
  ]);
});

test('starts a raid and returns Twitch\'s countdown timestamp', async () => {
  let requestedUrl;
  let requestedMethod;
  globalThis.fetch = async (url, options) => {
    requestedUrl = new URL(url);
    requestedMethod = options.method;
    return {
      ok: true,
      async json() {
        return { data: [{ created_at: '2026-08-17T12:00:00Z', is_mature: false }] };
      },
    };
  };

  const api = new TwitchApi('test-token');
  const raid = await api.startRaid('from-1', 'to-2');
  assert.equal(requestedMethod, 'POST');
  assert.equal(requestedUrl.pathname, '/helix/raids');
  assert.equal(requestedUrl.searchParams.get('from_broadcaster_id'), 'from-1');
  assert.equal(requestedUrl.searchParams.get('to_broadcaster_id'), 'to-2');
  assert.equal(raid.created_at, '2026-08-17T12:00:00Z');
});

test('sends the raid completion chat message as the logged-in user', async () => {
  let requestedUrl;
  let requestedOptions;
  globalThis.fetch = async (url, options) => {
    requestedUrl = new URL(url);
    requestedOptions = options;
    return {
      ok: true,
      async json() {
        return { data: [{ message_id: 'message-1', is_sent: true, drop_reason: null }] };
      },
    };
  };

  const api = new TwitchApi('test-token');
  const result = await api.sendChatMessage('destination-1', 'sender-1', 'Raid completed');

  assert.equal(requestedUrl.pathname, '/helix/chat/messages');
  assert.equal(requestedOptions.method, 'POST');
  assert.equal(requestedOptions.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(requestedOptions.body), {
    broadcaster_id: 'destination-1',
    sender_id: 'sender-1',
    message: 'Raid completed',
  });
  assert.equal(result.is_sent, true);
});

test('cancels the logged-in broadcaster\'s pending raid', async () => {
  let requestedUrl;
  let requestedMethod;
  globalThis.fetch = async (url, options) => {
    requestedUrl = new URL(url);
    requestedMethod = options.method;
    return { ok: true, status: 204 };
  };

  const api = new TwitchApi('test-token');
  await api.cancelRaid('from-1');
  assert.equal(requestedMethod, 'DELETE');
  assert.equal(requestedUrl.pathname, '/helix/raids');
  assert.equal(requestedUrl.searchParams.get('broadcaster_id'), 'from-1');
});

test('followed broadcaster IDs paginate and are cached for the session', async () => {
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    requestedUrls.push(parsed);
    const after = parsed.searchParams.get('after');

    return {
      ok: true,
      async json() {
        return after
          ? {
              data: [{ broadcaster_id: 'channel-3', followed_at: '2026-08-03T00:00:00Z' }],
              pagination: {},
            }
          : {
              data: [
                { broadcaster_id: 'channel-1', followed_at: '2026-08-01T00:00:00Z' },
                { broadcaster_id: 'channel-2' },
              ],
              pagination: { cursor: 'next-page' },
            };
      },
    };
  };

  const api = new TwitchApi('test-token');
  const first = await api.getFollowedBroadcasterIds('viewer-1');
  const second = await api.getFollowedBroadcasterIds('viewer-1');

  assert.deepEqual([...first], ['channel-1', 'channel-2', 'channel-3']);
  assert.equal(second, first);
  assert.equal(requestedUrls.length, 2);
  assert.equal(requestedUrls[0].pathname, '/helix/channels/followed');
  assert.equal(requestedUrls[0].searchParams.get('user_id'), 'viewer-1');
  assert.equal(requestedUrls[0].searchParams.get('first'), '100');
  assert.equal(requestedUrls[1].searchParams.get('after'), 'next-page');
  assert.equal(api.getFollowedAt('channel-1'), '2026-08-01T00:00:00Z');
});

test('followed live streams paginate until every live followed channel is loaded', async () => {
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    requestedUrls.push(parsed);
    const after = parsed.searchParams.get('after');
    return {
      ok: true,
      async json() {
        return after
          ? { data: [{ user_id: 'live-2' }, { user_id: 'live-3' }], pagination: {} }
          : {
              data: [{ user_id: 'live-1' }, { user_id: 'live-2' }],
              pagination: { cursor: 'second-page' },
            };
      },
    };
  };

  const api = new TwitchApi('test-token');
  const streams = await api.getFollowedLiveStreams('viewer-3');

  assert.deepEqual(streams.map((stream) => stream.user_id), ['live-1', 'live-2', 'live-3']);
  assert.equal(requestedUrls.length, 2);
  assert.equal(requestedUrls[0].pathname, '/helix/streams/followed');
  assert.equal(requestedUrls[0].searchParams.get('user_id'), 'viewer-3');
  assert.equal(requestedUrls[0].searchParams.get('first'), '100');
  assert.equal(requestedUrls[1].searchParams.get('after'), 'second-page');
});

test('failed follow lookup is evicted so a later search can retry', async () => {
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      return { ok: false, status: 401, async text() { return 'missing scope'; } };
    }
    return {
      ok: true,
      async json() {
        return { data: [{ broadcaster_id: 'channel-4' }], pagination: {} };
      },
    };
  };

  const api = new TwitchApi('test-token');
  await assert.rejects(() => api.getFollowedBroadcasterIds('viewer-2'), /401/);
  const retried = await api.getFollowedBroadcasterIds('viewer-2');

  assert.deepEqual([...retried], ['channel-4']);
  assert.equal(attempts, 2);
});

test('follower totals use the public total and are cached per channel', async () => {
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    requestedUrls.push(parsed);
    return {
      ok: true,
      async json() {
        return { total: 4321, data: [], pagination: {} };
      },
    };
  };

  const api = new TwitchApi('test-token');
  assert.equal(await api.getFollowerCount('channel-7'), 4321);
  assert.equal(await api.getFollowerCount('channel-7'), 4321);
  assert.equal(requestedUrls.length, 1);
  assert.equal(requestedUrls[0].pathname, '/helix/channels/followers');
  assert.equal(requestedUrls[0].searchParams.get('broadcaster_id'), 'channel-7');
  assert.equal(requestedUrls[0].searchParams.get('first'), '1');
});

test('follow-back status checks whether a candidate follows the logged-in broadcaster and caches it', async () => {
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    requestedUrls.push(parsed);
    return {
      ok: true,
      async json() {
        return { data: parsed.searchParams.get('user_id') === 'candidate-1' ? [{ user_id: 'candidate-1' }] : [] };
      },
    };
  };

  const api = new TwitchApi('test-token');
  assert.equal(await api.userFollowsBroadcaster('my-channel', 'candidate-1'), true);
  assert.equal(await api.userFollowsBroadcaster('my-channel', 'candidate-1'), true);
  assert.equal(requestedUrls.length, 1);
  assert.equal(requestedUrls[0].pathname, '/helix/channels/followers');
  assert.equal(requestedUrls[0].searchParams.get('broadcaster_id'), 'my-channel');
  assert.equal(requestedUrls[0].searchParams.get('user_id'), 'candidate-1');
  assert.equal(requestedUrls[0].searchParams.get('first'), '1');
});

test('activity history calls request broadcasts, clips, schedule, and profile data', async () => {
  const requestedUrls = [];
  const futureStart = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const futureEnd = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    requestedUrls.push(parsed);
    const payloads = {
      '/helix/videos': { data: [{ id: 'vod-1', created_at: new Date().toISOString() }] },
      '/helix/clips': { data: [{ id: 'clip-1' }] },
      '/helix/schedule': {
        data: { segments: [{ id: 'segment-1', start_time: futureStart, end_time: futureEnd }] },
      },
      '/helix/users': { data: [{ id: 'channel-9', created_at: '2020-01-01T00:00:00Z' }] },
    };
    return { ok: true, async json() { return payloads[parsed.pathname]; } };
  };

  const api = new TwitchApi('test-token');
  const [videos, clips, schedule, profile] = await Promise.all([
    api.getBroadcastHistory('channel-9'),
    api.getRecentClips('channel-9'),
    api.getNextScheduledStream('channel-9'),
    api.getBroadcasterProfile('channel-9'),
  ]);

  assert.equal(videos[0].id, 'vod-1');
  assert.equal(clips[0].id, 'clip-1');
  assert.equal(schedule.id, 'segment-1');
  assert.equal(profile.created_at, '2020-01-01T00:00:00Z');
  assert.deepEqual(
    requestedUrls.map((url) => url.pathname).sort(),
    ['/helix/clips', '/helix/schedule', '/helix/users', '/helix/videos']
  );
  const clipsUrl = requestedUrls.find((url) => url.pathname === '/helix/clips');
  assert.equal(clipsUrl.searchParams.get('broadcaster_id'), 'channel-9');
  assert.ok(clipsUrl.searchParams.get('started_at'));
  const scheduleUrl = requestedUrls.find((url) => url.pathname === '/helix/schedule');
  assert.equal(scheduleUrl.searchParams.get('first'), '25');
});

test('schedule context identifies a currently active published segment', async () => {
  const currentStart = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const currentEnd = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return {
        data: {
          segments: [{ id: 'current-segment', start_time: currentStart, end_time: currentEnd }],
        },
      };
    },
  });

  const api = new TwitchApi('test-token');
  const context = await api.getScheduleContext('channel-10');
  assert.equal(context.current.id, 'current-segment');
  assert.equal(context.next, null);
});

test('exact category names resolve in one cached Twitch games batch', async () => {
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    requestedUrls.push(parsed);
    return {
      ok: true,
      async json() {
        return { data: [
          { id: 'game-1', name: 'World of Warcraft' },
          { id: 'game-2', name: 'Phasmophobia' },
        ] };
      },
    };
  };

  const api = new TwitchApi('test-token');
  const first = await api.getGamesByNames(['World of Warcraft', 'Phasmophobia']);
  const second = await api.getGamesByNames(['World of Warcraft']);
  assert.deepEqual(first.map((game) => game.id), ['game-1', 'game-2']);
  assert.equal(second[0].id, 'game-1');
  assert.equal(requestedUrls.length, 1);
  assert.deepEqual(
    requestedUrls[0].searchParams.getAll('name'),
    ['World of Warcraft', 'Phasmophobia']
  );
});

test('category search places an exact Twitch game ahead of fuzzy results', async () => {
  const requestedUrls = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    requestedUrls.push(parsed);
    return {
      ok: true,
      async json() {
        if (parsed.pathname === '/helix/games') {
          return { data: [{ id: 'exact-id', name: 'Star Wars: The Old Republic' }] };
        }
        return {
          data: [
            { id: 'similar-id', name: 'Star Wars' },
            { id: 'exact-id', name: 'Star Wars: The Old Republic' },
          ],
          pagination: {},
        };
      },
    };
  };

  const api = new TwitchApi('test-token');
  const results = await api.searchCategories('Star Wars: The Old Republic', { maxResults: 20 });

  assert.deepEqual(results.map((game) => game.id), ['exact-id', 'similar-id']);
  assert.deepEqual(requestedUrls.map((url) => url.pathname), [
    '/helix/games',
    '/helix/search/categories',
  ]);
  assert.equal(requestedUrls[1].searchParams.get('first'), '20');
});

test('genre streams send multiple category IDs in one request', async () => {
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = new URL(url);
    return {
      ok: true,
      async json() {
        return { data: [{ user_id: 'live-1', viewer_count: 10 }], pagination: {} };
      },
    };
  };

  const api = new TwitchApi('test-token');
  const streams = await api.getLiveStreamsByGames(['game-1', 'game-2']);
  assert.equal(streams[0].user_id, 'live-1');
  assert.deepEqual(requestedUrl.searchParams.getAll('game_id'), ['game-1', 'game-2']);
  assert.equal(requestedUrl.searchParams.get('first'), '100');
});

test('tags-only discovery requests streams without a game category', async () => {
  let requestedUrl;
  globalThis.fetch = async (url) => {
    requestedUrl = new URL(url);
    return {
      ok: true,
      async json() {
        return { data: [{ user_id: 'any-game', viewer_count: 14 }], pagination: {} };
      },
    };
  };

  const api = new TwitchApi('test-token');
  const streams = await api.getLiveStreams({ maxResults: 100 });
  assert.equal(streams[0].user_id, 'any-game');
  assert.equal(requestedUrl.pathname, '/helix/streams');
  assert.equal(requestedUrl.searchParams.has('game_id'), false);
  assert.equal(requestedUrl.searchParams.get('first'), '100');
});

test('genre resolution falls back to category search for Twitch name variations', async () => {
  const paths = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    paths.push(parsed.pathname);
    return {
      ok: true,
      async json() {
        if (parsed.pathname === '/helix/games') return { data: [] };
        return {
          data: [{ id: 'warzone-id', name: 'Call of Duty: Warzone 2.0' }],
          pagination: {},
        };
      },
    };
  };

  const api = new TwitchApi('test-token');
  const result = await api.resolveGenreCategories(['Call of Duty: Warzone']);
  assert.equal(result.games[0].id, 'warzone-id');
  assert.deepEqual(result.unresolved, []);
  assert.deepEqual(paths, ['/helix/games', '/helix/search/categories']);
});

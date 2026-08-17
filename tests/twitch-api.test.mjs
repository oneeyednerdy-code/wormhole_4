import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  location: { origin: 'https://wormhole.example', pathname: '/' },
};

const { TwitchApi } = await import('../js/twitch-api.js');

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

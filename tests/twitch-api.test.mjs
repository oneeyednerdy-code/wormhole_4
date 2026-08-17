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
              data: [{ broadcaster_id: 'channel-3' }],
              pagination: {},
            }
          : {
              data: [
                { broadcaster_id: 'channel-1' },
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

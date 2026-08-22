import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const env = {
  TWITCH_CLIENT_ID: 'test-client',
  ASSETS: { fetch: async () => new Response('asset') },
};
const ctx = { waitUntil() {} };

test('Twitch gateway rejects unsupported Helix paths without an upstream request', async () => {
  const response = await worker.fetch(new Request('https://wormhole.test/api/twitch/helix/unsupported', {
    headers: { authorization: 'Bearer token' },
  }), env, ctx);
  assert.equal(response.status, 404);
});

test('Twitch gateway requires a bearer token', async () => {
  const response = await worker.fetch(new Request('https://wormhole.test/api/twitch/helix/users'), env, ctx);
  assert.equal(response.status, 401);
});

test('Twitch gateway forwards allowlisted requests to Twitch Helix', async () => {
  const originalFetch = globalThis.fetch;
  let upstreamUrl;
  let upstreamHeaders;
  globalThis.fetch = async (requestUrl, init) => {
    upstreamUrl = new URL(requestUrl);
    upstreamHeaders = new Headers(init.headers);
    return new Response(JSON.stringify({ data: [{ id: '1' }] }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'ratelimit-remaining': '799' },
    });
  };
  try {
    const response = await worker.fetch(new Request('https://wormhole.test/api/twitch/helix/users?id=1', {
      headers: { authorization: 'Bearer user-token', 'client-id': 'browser-client' },
    }), env, ctx);
    assert.equal(response.status, 200);
    assert.equal(upstreamUrl.origin, 'https://api.twitch.tv');
    assert.equal(upstreamUrl.pathname, '/helix/users');
    assert.equal(upstreamUrl.searchParams.get('id'), '1');
    assert.equal(upstreamHeaders.get('authorization'), 'Bearer user-token');
    assert.equal(upstreamHeaders.get('client-id'), 'test-client');
    assert.equal(response.headers.get('ratelimit-remaining'), '799');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

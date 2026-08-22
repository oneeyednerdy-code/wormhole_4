import { onRequestGet as twitchTrackerSummary } from './functions/api/twitchtracker-summary.js';

const TWITCH_HELIX_ORIGIN = 'https://api.twitch.tv';
const TWITCH_HELIX_PREFIX = '/api/twitch/helix';
const ALLOWED_HELIX_PATHS = new Set([
  '/users',
  '/streams',
  '/streams/followed',
  '/channels',
  '/channels/followed',
  '/channels/followers',
  '/games',
  '/search/categories',
  '/videos',
  '/clips',
  '/schedule',
  '/teams/channel',
  '/chat/settings',
  '/eventsub/subscriptions',
  '/raids',
]);

function jsonError(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function proxyTwitchHelix(request, env) {
  const incoming = new URL(request.url);
  const helixPath = incoming.pathname.slice(TWITCH_HELIX_PREFIX.length) || '/';

  if (!ALLOWED_HELIX_PATHS.has(helixPath)) {
    return jsonError('Unsupported Twitch API endpoint.', 404);
  }

  if (!['GET', 'POST', 'DELETE', 'PATCH'].includes(request.method)) {
    return jsonError('Method not allowed.', 405);
  }

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return jsonError('Twitch authorization is required.', 401);
  }

  const clientId = env.TWITCH_CLIENT_ID || request.headers.get('client-id');
  if (!clientId) {
    return jsonError('Twitch Client ID is not configured.', 500);
  }

  const upstream = new URL('/helix' + helixPath, TWITCH_HELIX_ORIGIN);
  upstream.search = incoming.search;

  const headers = new Headers();
  headers.set('authorization', authorization);
  headers.set('client-id', clientId);
  headers.set('accept', 'application/json');
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);

  const init = { method: request.method, headers, redirect: 'manual' };
  if (!['GET', 'HEAD'].includes(request.method)) init.body = request.body;

  try {
    const response = await fetch(upstream, init);
    const responseHeaders = new Headers();
    responseHeaders.set('content-type', response.headers.get('content-type') || 'application/json; charset=utf-8');
    responseHeaders.set('cache-control', 'no-store');
    for (const name of ['ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset']) {
      const value = response.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch {
    return jsonError('Twitch API is temporarily unavailable.', 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith(TWITCH_HELIX_PREFIX + '/')) {
      return proxyTwitchHelix(request, env);
    }

    if (url.pathname === '/api/twitchtracker-summary') {
      if (request.method !== 'GET') {
        return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
          status: 405,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'allow': 'GET',
            'cache-control': 'no-store',
          },
        });
      }
      return twitchTrackerSummary({ request, env, waitUntil: ctx.waitUntil.bind(ctx) });
    }

    return env.ASSETS.fetch(request);
  },
};

const HELIX = 'https://api.twitch.tv/helix';
const SAFE_ID = /^\d{1,30}$/;

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: JSON.stringify(body),
  };
}

async function validateToken(token, clientId) {
  const result = await fetch('https://id.twitch.tv/oauth2/validate', {
    headers: { Authorization: `OAuth ${token}` },
  });
  if (!result.ok) return null;
  const validation = await result.json();
  return validation.client_id === clientId ? validation : null;
}

async function twitchRequest(path, token, clientId, method = 'POST', body) {
  const result = await fetch(`${HELIX}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Client-Id': clientId,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await result.text();
  if (!result.ok) return response(result.status, { error: 'Twitch rejected the protected action.', detail: text.slice(0, 300) });
  return response(result.status, text ? JSON.parse(text) : {});
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return response(405, { error: 'Method not allowed.' });
  const allowedOrigin = process.env.WORMHOLE_ALLOWED_ORIGIN;
  const origin = event.headers.origin || event.headers.Origin;
  if (!allowedOrigin || origin !== allowedOrigin) return response(403, { error: 'Origin rejected.' });

  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) return response(503, { error: 'Protected actions are not configured.' });
  const authorization = event.headers.authorization || event.headers.Authorization || '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return response(401, { error: 'Missing Twitch authorization.' });

  const validation = await validateToken(token, clientId);
  if (!validation?.user_id) return response(401, { error: 'Invalid Twitch session.' });

  let input;
  try { input = JSON.parse(event.body || '{}'); } catch { return response(400, { error: 'Invalid JSON.' }); }
  const action = input.action;
  if (action === 'start') {
    if (input.fromBroadcasterId !== validation.user_id || !SAFE_ID.test(input.toBroadcasterId || '')) {
      return response(403, { error: 'Broadcaster identity mismatch.' });
    }
    const query = new URLSearchParams({ from_broadcaster_id: validation.user_id, to_broadcaster_id: input.toBroadcasterId });
    return twitchRequest(`/raids?${query}`, token, clientId);
  }
  if (action === 'cancel') {
    if (input.fromBroadcasterId !== validation.user_id) return response(403, { error: 'Broadcaster identity mismatch.' });
    const query = new URLSearchParams({ broadcaster_id: validation.user_id });
    return twitchRequest(`/raids?${query}`, token, clientId, 'DELETE');
  }
  if (action === 'chat') {
    if (input.senderId !== validation.user_id || !SAFE_ID.test(input.broadcasterId || '')) {
      return response(403, { error: 'Sender identity mismatch.' });
    }
    const message = String(input.message || '').trim().slice(0, 500);
    if (!message) return response(400, { error: 'Message is required.' });
    return twitchRequest('/chat/messages', token, clientId, 'POST', {
      broadcaster_id: input.broadcasterId,
      sender_id: validation.user_id,
      message,
    });
  }
  return response(400, { error: 'Unsupported action.' });
}

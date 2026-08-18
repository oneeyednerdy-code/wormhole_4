import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../netlify/functions/raid-action.mjs';

test('protected raid endpoint rejects non-POST requests before Twitch access', async () => {
  const result = await handler({ httpMethod: 'GET', headers: {} });
  assert.equal(result.statusCode, 405);
});

test('protected raid endpoint rejects an unconfigured or mismatched origin', async () => {
  const previous = process.env.WORMHOLE_ALLOWED_ORIGIN;
  process.env.WORMHOLE_ALLOWED_ORIGIN = 'https://wormhole.example';
  try {
    const result = await handler({ httpMethod: 'POST', headers: { origin: 'https://evil.example' } });
    assert.equal(result.statusCode, 403);
  } finally {
    if (previous === undefined) delete process.env.WORMHOLE_ALLOWED_ORIGIN;
    else process.env.WORMHOLE_ALLOWED_ORIGIN = previous;
  }
});

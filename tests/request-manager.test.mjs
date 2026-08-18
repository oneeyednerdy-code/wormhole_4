import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestManager, RequestError } from '../js/browser-request-v67.js';

function response(status, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[name] ?? null },
    text: async () => 'failure',
  };
}

test('captures Twitch rate-limit headers', async () => {
  const manager = new RequestManager({
    fetchImpl: async () => response(200, {
      'Ratelimit-Limit': '800',
      'Ratelimit-Remaining': '799',
      'Ratelimit-Reset': '100',
    }),
  });
  await manager.request('https://example.test');
  assert.deepEqual(manager.rateLimit, { limit: 800, remaining: 799, resetAt: 100000 });
});

test('does not retry mutation requests', async () => {
  let calls = 0;
  const manager = new RequestManager({ fetchImpl: async () => { calls += 1; return response(503); } });
  await assert.rejects(
    manager.request('https://example.test', { method: 'POST' }),
    (error) => error instanceof RequestError && error.status === 503
  );
  assert.equal(calls, 1);
});

test('honors an already-aborted search signal', async () => {
  const controller = new AbortController();
  controller.abort();
  const manager = new RequestManager({ fetchImpl: async () => response(200) });
  await assert.rejects(
    manager.request('https://example.test', {}, { signal: controller.signal }),
    (error) => error.name === 'AbortError'
  );
});

test('reports timeouts as request failures instead of user cancellations', async () => {
  const manager = new RequestManager({
    fetchImpl: (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }),
    timeoutMs: 5,
    maxRetries: 0,
  });
  await assert.rejects(
    manager.request('https://example.test'),
    (error) => error instanceof RequestError && error.status === 408
  );
});

test('binds browser fetch to the global receiver', async () => {
  const originalFetch = globalThis.fetch;
  let receiver;
  globalThis.fetch = function () {
    receiver = this;
    return Promise.resolve(response(200));
  };
  try {
    const manager = new RequestManager();
    await manager.request('https://example.test');
    assert.equal(receiver, globalThis);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

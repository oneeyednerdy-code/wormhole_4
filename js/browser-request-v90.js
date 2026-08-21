// Shared browser request coordination for Alpha-0.0.90.
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);

export class RequestError extends Error {
  constructor(message, { status = 0, retryAt = null, body = '', code = 'request_failed' } = {}) {
    super(message);
    this.name = 'RequestError';
    this.status = status;
    this.retryAt = retryAt;
    this.body = body;
    this.code = code;
  }
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener?.('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('The request was canceled.', 'AbortError'));
    }, { once: true });
  });
}

function combinedSignal(signal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  signal?.addEventListener?.('abort', () => controller.abort(), { once: true });
  return { signal: controller.signal, get timedOut() { return timedOut; }, clear: () => clearTimeout(timeout) };
}

export class RequestManager {
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 15_000, maxRetries = 2 } = {}) {
    if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
    // Browser fetch is receiver-sensitive in Firefox and some WebViews.
    // Calling a stored `window.fetch` as `this.fetchImpl()` changes `this`
    // and throws "Illegal invocation", so always invoke it against globalThis.
    this.fetchImpl = (...args) => Reflect.apply(fetchImpl, globalThis, args);
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.rateLimit = { limit: null, remaining: null, resetAt: null };
  }

  _captureRateLimit(response) {
    const limit = Number(response.headers?.get?.('Ratelimit-Limit'));
    const remaining = Number(response.headers?.get?.('Ratelimit-Remaining'));
    const resetSeconds = Number(response.headers?.get?.('Ratelimit-Reset'));
    this.rateLimit = {
      limit: Number.isFinite(limit) ? limit : null,
      remaining: Number.isFinite(remaining) ? remaining : null,
      resetAt: Number.isFinite(resetSeconds) ? resetSeconds * 1000 : null,
    };
  }

  async request(url, options = {}, { signal, retries, timeoutMs } = {}) {
    const method = String(options.method ?? 'GET').toUpperCase();
    const allowedRetries = retries ?? (method === 'GET' ? this.maxRetries : 0);
    let attempt = 0;

    while (true) {
      if (signal?.aborted) throw new DOMException('The request was canceled.', 'AbortError');
      const active = combinedSignal(signal, timeoutMs ?? this.timeoutMs);
      try {
        const response = await this.fetchImpl(url, { ...options, signal: active.signal });
        this._captureRateLimit(response);
        if (response.ok) return response;

        const body = await response.text();
        const retryAt = this.rateLimit.resetAt;
        const retryable = RETRYABLE_STATUSES.has(response.status) || response.status === 429;
        if (retryable && attempt < allowedRetries) {
          const rateDelay = retryAt ? Math.max(0, retryAt - Date.now()) : 0;
          const delay = Math.min(Math.max(rateDelay, 500 * 2 ** attempt), 5_000);
          attempt += 1;
          await wait(delay, signal);
          continue;
        }
        throw new RequestError(`Request failed (${response.status}).`, {
          status: response.status,
          retryAt,
          body,
        });
      } catch (error) {
        if (active.timedOut) {
          if (attempt < allowedRetries && method === 'GET') {
            await wait(Math.min(500 * 2 ** attempt, 2_000), signal);
            attempt += 1;
            continue;
          }
          throw new RequestError('Request timed out.', { status: 408, code: 'timeout' });
        }
        if (error?.name === 'AbortError' || error instanceof RequestError) throw error;
        if (attempt >= allowedRetries) {
          throw new RequestError('The browser could not reach Twitch.', {
            status: 0,
            code: 'network',
          });
        }
        await wait(Math.min(500 * 2 ** attempt, 2_000), signal);
        attempt += 1;
      } finally {
        active.clear();
      }
    }
  }
}

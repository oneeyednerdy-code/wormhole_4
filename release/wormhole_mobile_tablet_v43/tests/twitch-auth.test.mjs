import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() {
    this.data = new Map();
  }
  getItem(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  }
  setItem(key, value) {
    this.data.set(key, String(value));
  }
  removeItem(key) {
    this.data.delete(key);
  }
}

globalThis.sessionStorage = new MemoryStorage();
globalThis.localStorage = new MemoryStorage();
globalThis.document = { title: 'Wormhole' };
globalThis.window = {
  location: {
    origin: 'https://wormhole.example',
    pathname: '/',
    search: '',
    hash: '',
    href: '',
  },
  history: { replaceState() {} },
};

const { getOAuthRedirectUri } = await import('../js/config.js');
const { TwitchAuth } = await import('../js/twitch-auth.js');

test('normalizes index.html to a stable OAuth callback directory', () => {
  assert.equal(getOAuthRedirectUri({ origin: 'https://wormhole.example', pathname: '/index.html' }), 'https://wormhole.example/');
  assert.equal(getOAuthRedirectUri({ origin: 'https://example.com', pathname: '/wormhole/index.html' }), 'https://example.com/wormhole/');
});

test('rejects direct file access with a useful hosting message', () => {
  assert.throws(
    () => getOAuthRedirectUri({ origin: 'null', pathname: '/index.html' }),
    /served from HTTPS or localhost/
  );
});

test('login creates a valid Twitch authorization URL and durable verifier', () => {
  sessionStorage.removeItem('wormhole_oauth_state');
  localStorage.removeItem('wormhole_oauth_state');
  TwitchAuth.redirectToLogin();

  const url = new URL(window.location.href);
  const state = url.searchParams.get('state');
  assert.equal(url.origin, 'https://id.twitch.tv');
  assert.equal(url.searchParams.get('response_type'), 'token');
  assert.ok(url.searchParams.get('scope').split(' ').includes('user:write:chat'));
  assert.ok(state);
  assert.equal(sessionStorage.getItem('wormhole_oauth_state'), state);
  assert.equal(localStorage.getItem('wormhole_oauth_state'), state);
});

test('OAuth state survives a return in a fresh browsing context', () => {
  sessionStorage.removeItem('wormhole_oauth_state');
  localStorage.setItem('wormhole_oauth_state', 'verified-state');
  window.location.hash = '#access_token=test-token&state=verified-state&token_type=bearer';

  assert.equal(TwitchAuth.captureRedirectToken(), 'test-token');
  assert.equal(sessionStorage.getItem('wormhole_access_token'), 'test-token');
  assert.equal(localStorage.getItem('wormhole_oauth_state'), null);
});

test('login can continue when localStorage is blocked but sessionStorage works', () => {
  const workingLocalStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  sessionStorage.removeItem('wormhole_oauth_state');
  assert.doesNotThrow(() => TwitchAuth.redirectToLogin());
  assert.ok(sessionStorage.getItem('wormhole_oauth_state'));
  globalThis.localStorage = workingLocalStorage;
});

test('OAuth callbacks with the wrong state remain rejected', () => {
  sessionStorage.removeItem('wormhole_oauth_state');
  localStorage.setItem('wormhole_oauth_state', 'expected-state');
  window.location.hash = '#access_token=bad-token&state=wrong-state&token_type=bearer';

  assert.throws(
    () => TwitchAuth.captureRedirectToken(),
    /could not be verified/
  );
  assert.equal(sessionStorage.getItem('wormhole_access_token'), 'test-token');
});

test('OAuth callback errors are shown and cleared instead of silently ignored', () => {
  sessionStorage.setItem('wormhole_oauth_state', 'error-state');
  window.location.search = '?error=access_denied&error_description=Permission+declined&state=error-state';
  window.location.hash = '';
  assert.throws(() => TwitchAuth.captureRedirectToken(), /Permission declined/);
  assert.equal(sessionStorage.getItem('wormhole_oauth_state'), null);
  window.location.search = '';
});

test('token validation checks client identity and every requested scope', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { client_id: 'wrong-client', scopes: ['channel:manage:raids', 'user:read:follows'] };
    },
  });
  assert.equal((await TwitchAuth.validateToken('token')).reason, 'wrong_client');

  globalThis.fetch = async () => ({
    ok: true,
    async json() {
      return { client_id: '15d6s3tdyd3p7o3owf1ugx6zorpgfw', scopes: ['user:read:follows'] };
    },
  });
  assert.equal((await TwitchAuth.validateToken('token')).reason, 'missing_scopes');
});

test('temporary validation outages preserve the session for retry', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal((await TwitchAuth.validateToken('token')).reason, 'unavailable');
});

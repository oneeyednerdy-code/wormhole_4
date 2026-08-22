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
globalThis.document = { title: 'Wormhole', cookie: '' };
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

const { getOAuthRedirectUri } = await import('../js/twitch-config-v91.js');
const { TWITCH_CONFIG } = await import('../js/twitch-config-v91.js');
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

test('an explicit production redirect can override host aliases', () => {
  TWITCH_CONFIG.redirectUriOverride = 'https://wormhole.example/';
  assert.equal(TWITCH_CONFIG.redirectUri, 'https://wormhole.example/');
  TWITCH_CONFIG.redirectUriOverride = '';
});

test('login creates a valid Twitch authorization URL and durable verifier', () => {
  sessionStorage.removeItem('wormhole_oauth_state');
  localStorage.removeItem('wormhole_oauth_state');
  TwitchAuth.redirectToLogin();

  const url = new URL(window.location.href);
  const state = url.searchParams.get('state');
  assert.equal(url.origin, 'https://id.twitch.tv');
  assert.equal(url.searchParams.get('response_type'), 'token');
  assert.equal(url.searchParams.get('force_verify'), 'true');
  assert.ok(!url.searchParams.get('scope').split(' ').includes('user:write:chat'));
  assert.ok(url.searchParams.get('scope').split(' ').includes('moderator:read:followers'));
  assert.ok(!url.searchParams.get('scope').split(' ').includes('channel:manage:raids'));
  assert.ok(state);
  assert.equal(sessionStorage.getItem('wormhole_oauth_state'), state);
  assert.equal(localStorage.getItem('wormhole_oauth_state'), state);
});

test('raid controls request the additional raid scope only when explicitly enabled', () => {
  TwitchAuth.redirectToLogin({ includeRaidPermission: true });
  const scopes = new URL(window.location.href).searchParams.get('scope').split(' ');
  assert.ok(scopes.includes('user:read:follows'));
  assert.ok(scopes.includes('moderator:read:followers'));
  assert.ok(scopes.includes('channel:manage:raids'));
});

test('OAuth state can fall back to a short-lived SameSite cookie', () => {
  const workingSessionStorage = globalThis.sessionStorage;
  const workingLocalStorage = globalThis.localStorage;
  const blocked = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); },
  };
  globalThis.sessionStorage = blocked;
  globalThis.localStorage = blocked;
  document.cookie = '';
  assert.doesNotThrow(() => TwitchAuth.redirectToLogin());
  const state = new URL(window.location.href).searchParams.get('state');
  window.location.hash = `#access_token=cookie-token&state=${state}&token_type=bearer`;
  assert.equal(TwitchAuth.captureRedirectToken(), 'cookie-token');
  globalThis.sessionStorage = workingSessionStorage;
  globalThis.localStorage = workingLocalStorage;
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

test('expired OAuth state is rejected', () => {
  sessionStorage.setItem('wormhole_oauth_state', 'expired-state');
  sessionStorage.setItem('wormhole_oauth_state_created', String(Date.now() - 31 * 60 * 1000));
  localStorage.removeItem('wormhole_oauth_state');
  window.location.hash = '#access_token=bad-token&state=expired-state&token_type=bearer';
  assert.throws(() => TwitchAuth.captureRedirectToken(), /could not be verified/);
});

test('OAuth callback errors are shown and cleared instead of silently ignored', () => {
  sessionStorage.setItem('wormhole_oauth_state', 'error-state');
  window.location.search = '?error=access_denied&error_description=Permission+declined&state=error-state';
  window.location.hash = '';
  assert.throws(() => TwitchAuth.captureRedirectToken(), /Permission declined/);
  assert.equal(sessionStorage.getItem('wormhole_oauth_state'), null);
  window.location.search = '';
});

test('token validation checks client identity and only the scopes required for the action', async () => {
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
      return { client_id: 'wigwgqcieffev63tiiwq6j3dozv4o5', scopes: ['user:read:follows'] };
    },
  });
  const status = await TwitchAuth.validateToken('token');
  assert.equal(status.reason, 'missing_scopes');
  assert.deepEqual(status.missingScopes, ['moderator:read:followers']);

  const raidStatus = await TwitchAuth.validateToken('token', {
    requiredScopes: TWITCH_CONFIG.scopes,
  });
  assert.equal(raidStatus.reason, 'missing_scopes');
  assert.deepEqual(raidStatus.missingScopes, ['moderator:read:followers', 'channel:manage:raids']);
});

test('granted Twitch permissions can be checked without exposing the token', () => {
  const validation = { scopes: ['user:read:follows', 'channel:manage:raids'] };
  assert.equal(TwitchAuth.hasScopes(validation, ['channel:manage:raids']), true);
  assert.equal(TwitchAuth.hasScopes(validation, ['moderator:read:followers']), false);
});

test('temporary validation outages preserve the session for retry', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal((await TwitchAuth.validateToken('token')).reason, 'unavailable');

  globalThis.fetch = async () => ({ ok: false, status: 503 });
  assert.equal((await TwitchAuth.validateToken('token')).reason, 'unavailable');

  globalThis.fetch = async () => ({ ok: false, status: 401 });
  assert.equal((await TwitchAuth.validateToken('token')).reason, 'invalid');
});

test('validated Twitch identity can provide a limited profile fallback', () => {
  assert.deepEqual(
    TwitchAuth.userFromValidation({ user_id: '123', login: 'oneeyednerdy' }),
    {
      id: '123',
      login: 'oneeyednerdy',
      display_name: 'oneeyednerdy',
      profile_image_url: '',
      _limitedProfile: true,
    }
  );
  assert.equal(TwitchAuth.userFromValidation({ user_id: '123' }), null);
});

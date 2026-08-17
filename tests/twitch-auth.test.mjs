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

const { TwitchAuth } = await import('../js/twitch-auth.js');

test('login creates a valid Twitch authorization URL and durable verifier', () => {
  sessionStorage.removeItem('wormhole_oauth_state');
  localStorage.removeItem('wormhole_oauth_state');
  TwitchAuth.redirectToLogin();

  const url = new URL(window.location.href);
  const state = url.searchParams.get('state');
  assert.equal(url.origin, 'https://id.twitch.tv');
  assert.equal(url.searchParams.get('response_type'), 'token');
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

import { TWITCH_CONFIG } from './config.js?v=43';

const TOKEN_KEY = 'wormhole_access_token';
const LEGACY_TOKEN_KEY = 'raid_finder_token';
const OAUTH_STATE_KEY = 'wormhole_oauth_state';

function browserStorage(name) {
  try {
    return globalThis[name] ?? null;
  } catch {
    return null;
  }
}

function safelyGet(storage, key) {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function safelySet(storage, key, value) {
  try {
    storage?.setItem(key, value);
    return Boolean(storage);
  } catch {
    return false;
  }
}

function safelyRemove(storage, key) {
  try {
    storage?.removeItem(key);
  } catch {
    // A blocked storage area should not prevent login cleanup.
  }
}

function readOAuthState() {
  return safelyGet(browserStorage('sessionStorage'), OAUTH_STATE_KEY)
    || safelyGet(browserStorage('localStorage'), OAUTH_STATE_KEY);
}

function clearOAuthState() {
  safelyRemove(browserStorage('sessionStorage'), OAUTH_STATE_KEY);
  safelyRemove(browserStorage('localStorage'), OAUTH_STATE_KEY);
}

function cleanRedirectUrl() {
  window.history.replaceState({}, document.title, TWITCH_CONFIG.redirectUri);
}

function createOAuthState() {
  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('Twitch login requires a secure HTTPS connection or localhost.');
  }
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Handles the Twitch OAuth implicit-grant flow using a plain browser
 * redirect (no popups, no custom URL schemes needed — this is the native
 * environment for Twitch's OAuth design).
 */
export const TwitchAuth = {
  /** Sends the browser to Twitch's authorize page. */
  redirectToLogin() {
    const state = createOAuthState();
    const savedInSession = safelySet(browserStorage('sessionStorage'), OAUTH_STATE_KEY, state);
    // Also persist the short-lived verifier across browsing contexts. Some
    // hosts/browsers return from Twitch in a fresh tab where sessionStorage
    // is empty, while localStorage remains scoped to the same app origin.
    const savedLocally = safelySet(browserStorage('localStorage'), OAUTH_STATE_KEY, state);
    if (!savedInSession && !savedLocally) {
      throw new Error('Twitch login needs browser storage. Allow site storage for Wormhole and try again.');
    }
    const url = new URL(TWITCH_CONFIG.authorizeUrl);
    url.searchParams.set('client_id', TWITCH_CONFIG.clientId);
    url.searchParams.set('redirect_uri', TWITCH_CONFIG.redirectUri);
    url.searchParams.set('response_type', 'token');
    url.searchParams.set('scope', TWITCH_CONFIG.scopes.join(' '));
    url.searchParams.set('state', state);
    window.location.href = url.toString();
  },

  /**
   * Call once on page load. If the URL contains a Twitch OAuth redirect
   * fragment (#access_token=...), stores the token and cleans the URL.
   * Returns the token if one was just captured, otherwise null.
   */
  captureRedirectToken() {
    const query = new URLSearchParams(window.location.search);
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const callback = query.has('error') ? query : fragment;
    if (callback.has('error')) {
      const expectedState = readOAuthState();
      const returnedState = callback.get('state');
      clearOAuthState();
      const message = expectedState && returnedState === expectedState
        ? callback.get('error_description') || 'Twitch login was cancelled.'
        : 'Twitch login could not be verified. Please try again.';
      cleanRedirectUrl();
      throw new Error(message);
    }
    if (!window.location.hash) return null;
    const token = fragment.get('access_token');
    if (!token) return null;

    const expectedState = readOAuthState();
    const returnedState = fragment.get('state');
    clearOAuthState();
    if (!expectedState || !returnedState || returnedState !== expectedState) {
      cleanRedirectUrl();
      throw new Error('Twitch login could not be verified. Please try again.');
    }

    safelySet(browserStorage('sessionStorage'), TOKEN_KEY, token);
    // Strip the token out of the visible URL/history.
    cleanRedirectUrl();
    return token;
  },

  getSavedToken() {
    const current = safelyGet(browserStorage('sessionStorage'), TOKEN_KEY);
    if (current) return current;
    const legacy = safelyGet(browserStorage('localStorage'), LEGACY_TOKEN_KEY);
    if (legacy) {
      safelySet(browserStorage('sessionStorage'), TOKEN_KEY, legacy);
      safelyRemove(browserStorage('localStorage'), LEGACY_TOKEN_KEY);
    }
    return legacy;
  },

  async validateToken(token) {
    try {
      const res = await fetch(TWITCH_CONFIG.validateUrl, {
        headers: { Authorization: `OAuth ${token}` },
      });
      if (!res.ok) return { valid: false, reason: 'invalid' };
      const validation = await res.json();
      if (validation.client_id !== TWITCH_CONFIG.clientId) {
        return { valid: false, reason: 'wrong_client' };
      }
      const grantedScopes = new Set(validation.scopes ?? []);
      if (!TWITCH_CONFIG.scopes.every((scope) => grantedScopes.has(scope))) {
        return { valid: false, reason: 'missing_scopes' };
      }
      return { valid: true, validation };
    } catch {
      return { valid: false, reason: 'unavailable' };
    }
  },

  async isTokenValid(token) {
    return (await this.validateToken(token)).valid;
  },

  async logout() {
    const token = safelyGet(browserStorage('sessionStorage'), TOKEN_KEY)
      || safelyGet(browserStorage('localStorage'), LEGACY_TOKEN_KEY);
    if (token) {
      try {
        const url = new URL(TWITCH_CONFIG.revokeUrl);
        url.searchParams.set('client_id', TWITCH_CONFIG.clientId);
        url.searchParams.set('token', token);
        await fetch(url.toString(), { method: 'POST' });
      } catch {
        // Best-effort revoke; ignore network errors on logout.
      }
    }
    safelyRemove(browserStorage('sessionStorage'), TOKEN_KEY);
    clearOAuthState();
    safelyRemove(browserStorage('localStorage'), LEGACY_TOKEN_KEY);
  },
};

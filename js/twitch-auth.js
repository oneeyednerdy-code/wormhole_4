import { TWITCH_CONFIG } from './config.js';

const TOKEN_KEY = 'wormhole_access_token';
const LEGACY_TOKEN_KEY = 'raid_finder_token';
const OAUTH_STATE_KEY = 'wormhole_oauth_state';

function cleanRedirectUrl() {
  window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
}

function createOAuthState() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
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
    sessionStorage.setItem(OAUTH_STATE_KEY, state);
    // Also persist the short-lived verifier across browsing contexts. Some
    // hosts/browsers return from Twitch in a fresh tab where sessionStorage
    // is empty, while localStorage remains scoped to the same app origin.
    localStorage.setItem(OAUTH_STATE_KEY, state);
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
    if (query.has('error')) {
      const message = query.get('error_description') || 'Twitch login was cancelled.';
      cleanRedirectUrl();
      throw new Error(message);
    }
    if (!window.location.hash) return null;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('access_token');
    if (!token) return null;

    const expectedState =
      sessionStorage.getItem(OAUTH_STATE_KEY) || localStorage.getItem(OAUTH_STATE_KEY);
    const returnedState = params.get('state');
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    localStorage.removeItem(OAUTH_STATE_KEY);
    if (!expectedState || !returnedState || returnedState !== expectedState) {
      cleanRedirectUrl();
      throw new Error('Twitch login could not be verified. Please try again.');
    }

    sessionStorage.setItem(TOKEN_KEY, token);
    // Strip the token out of the visible URL/history.
    cleanRedirectUrl();
    return token;
  },

  getSavedToken() {
    const current = sessionStorage.getItem(TOKEN_KEY);
    if (current) return current;
    const legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
    if (legacy) {
      sessionStorage.setItem(TOKEN_KEY, legacy);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
    }
    return legacy;
  },

  async isTokenValid(token) {
    try {
      const res = await fetch(TWITCH_CONFIG.validateUrl, {
        headers: { Authorization: `OAuth ${token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  async logout() {
    const token = sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
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
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(OAUTH_STATE_KEY);
    localStorage.removeItem(OAUTH_STATE_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  },
};

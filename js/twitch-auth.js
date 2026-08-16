import { TWITCH_CONFIG } from './config.js';

const TOKEN_KEY = 'raid_finder_token';

/**
 * Handles the Twitch OAuth implicit-grant flow using a plain browser
 * redirect (no popups, no custom URL schemes needed — this is the native
 * environment for Twitch's OAuth design).
 */
export const TwitchAuth = {
  /** Sends the browser to Twitch's authorize page. */
  redirectToLogin() {
    const url = new URL(TWITCH_CONFIG.authorizeUrl);
    url.searchParams.set('client_id', TWITCH_CONFIG.clientId);
    url.searchParams.set('redirect_uri', TWITCH_CONFIG.redirectUri);
    url.searchParams.set('response_type', 'token');
    url.searchParams.set('scope', TWITCH_CONFIG.scopes.join(' '));
    window.location.href = url.toString();
  },

  /**
   * Call once on page load. If the URL contains a Twitch OAuth redirect
   * fragment (#access_token=...), stores the token and cleans the URL.
   * Returns the token if one was just captured, otherwise null.
   */
  captureRedirectToken() {
    if (!window.location.hash) return null;
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token = params.get('access_token');
    if (!token) return null;

    localStorage.setItem(TOKEN_KEY, token);
    // Strip the token out of the visible URL/history.
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
    return token;
  },

  getSavedToken() {
    return localStorage.getItem(TOKEN_KEY);
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
    const token = localStorage.getItem(TOKEN_KEY);
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
    localStorage.removeItem(TOKEN_KEY);
  },
};

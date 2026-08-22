// Twitch application configuration for Alpha-0.0.91.
// Create an app at https://dev.twitch.tv/console/apps
//
// - Set the OAuth Redirect URL in the Twitch dev console to the exact URL
//   this site will be served from (see REDIRECT_URI below).
// - This uses the OAuth *implicit* grant flow (response_type=token), which
//   is the right choice for a client-only static site: no server, no client
//   secret to protect.
export function getOAuthRedirectUri(location = window.location) {
  if (!location?.origin || location.origin === 'null' || !/^https?:\/\//i.test(location.origin)) {
    throw new Error('Twitch login requires Wormhole to be served from HTTPS or localhost; it cannot run from a file opened directly on your computer.');
  }
  const path = location.pathname || '/';
  const directoryPath = path.endsWith('/')
    ? path
    : path.slice(0, path.lastIndexOf('/') + 1) || '/';
  return new URL(directoryPath, location.origin).toString();
}

export const TWITCH_CONFIG = {
  clientId: 'wigwgqcieffev63tiiwq6j3dozv4o5',
  // Usually leave blank. If your host serves the same app through aliases or
  // rewrites, set this to the one exact production callback registered in the
  // Twitch Developer Console, including its trailing slash.
  redirectUriOverride: '',
  // Must exactly match an "OAuth Redirect URL" registered on your Twitch app.
  // Defaults to wherever this page is currently served from, so it works
  // unchanged on localhost, GitHub Pages, or another static host: just make sure
  // the URL you register in the Twitch console matches this at runtime.
  get redirectUri() {
    return this.redirectUriOverride || getOAuthRedirectUri();
  },

  // Discovery is read-only by default. Raid permission is requested later,
  // only when the streamer explicitly enables Wormhole's raid controls.
  discoveryScopes: [
    'user:read:follows',
    'moderator:read:followers',
  ],
  raidScopes: ['channel:manage:raids'],
  get scopes() {
    return [...this.discoveryScopes, ...this.raidScopes];
  },

  authorizeUrl: 'https://id.twitch.tv/oauth2/authorize',
  // Twitch Helix requests go through Wormhole's same-origin Cloudflare Worker.
  // OAuth authorization/validation remains with Twitch; API data calls use this gateway.
  apiBaseUrl: `${globalThis.location?.origin ?? 'http://localhost'}/api/twitch/helix`,
  validateUrl: 'https://id.twitch.tv/oauth2/validate',
  revokeUrl: 'https://id.twitch.tv/oauth2/revoke',
};

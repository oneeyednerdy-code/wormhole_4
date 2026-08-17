// Fill in your own Twitch application credentials.
// Create an app at https://dev.twitch.tv/console/apps
//
// - Set the OAuth Redirect URL in the Twitch dev console to the exact URL
//   this site will be served from (see REDIRECT_URI below).
// - This uses the OAuth *implicit* grant flow (response_type=token), which
//   is the right choice for a client-only static site: no server, no client
//   secret to protect.
export function getOAuthRedirectUri(location = window.location) {
  const path = location.pathname || '/';
  const directoryPath = path.endsWith('/')
    ? path
    : path.slice(0, path.lastIndexOf('/') + 1) || '/';
  return new URL(directoryPath, location.origin).toString();
}

export const TWITCH_CONFIG = {
  clientId: '15d6s3tdyd3p7o3owf1ugx6zorpgfw',

  // Must exactly match an "OAuth Redirect URL" registered on your Twitch app.
  // Defaults to wherever this page is currently served from, so it works
  // unchanged on localhost, GitHub Pages, Netlify, etc. — just make sure
  // the URL you register in the Twitch console matches this at runtime.
  get redirectUri() {
    return getOAuthRedirectUri();
  },

  // channel:manage:raids -> lets the app actually start a raid for you
  // user:read:follows    -> marks matching channels you already follow
  scopes: ['channel:manage:raids', 'user:read:follows'],

  authorizeUrl: 'https://id.twitch.tv/oauth2/authorize',
  // This is Twitch's own API root (they call it "Helix") — the path is
  // fixed by Twitch and can't be renamed without breaking every request.
  apiBaseUrl: 'https://api.twitch.tv/helix',
  validateUrl: 'https://id.twitch.tv/oauth2/validate',
  revokeUrl: 'https://id.twitch.tv/oauth2/revoke',
};

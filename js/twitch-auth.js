import { TWITCH_CONFIG } from './twitch-config-v53.js?v=53';

const TOKEN_KEY = 'wormhole_access_token';
const LEGACY_TOKEN_KEY = 'raid_finder_token';
const OAUTH_STATE_KEY = 'wormhole_oauth_state';
const OAUTH_STATE_CREATED_KEY = 'wormhole_oauth_state_created';
const OAUTH_STATE_COOKIE = 'wormhole_oauth_verifier';
const OAUTH_STATE_MAX_AGE_MS = 30 * 60 * 1000;

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

function readOAuthStateCookie() {
  try {
    const raw = String(globalThis.document?.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${OAUTH_STATE_COOKIE}=`))
      ?.slice(OAUTH_STATE_COOKIE.length + 1);
    if (!raw) return null;
    const [state, createdAtRaw] = decodeURIComponent(raw).split('.');
    const createdAt = Number(createdAtRaw);
    if (!state || !Number.isFinite(createdAt) || Date.now() - createdAt > OAUTH_STATE_MAX_AGE_MS) {
      return null;
    }
    return state;
  } catch {
    return null;
  }
}

function writeOAuthStateCookie(state, createdAt) {
  try {
    const secure = globalThis.location?.protocol === 'https:' || globalThis.window?.location?.protocol === 'https:'
      ? '; Secure'
      : '';
    globalThis.document.cookie = `${OAUTH_STATE_COOKIE}=${encodeURIComponent(`${state}.${createdAt}`)}; Path=/; Max-Age=1800; SameSite=Lax${secure}`;
    return readOAuthStateCookie() === state;
  } catch {
    return false;
  }
}

function clearOAuthStateCookie() {
  try {
    globalThis.document.cookie = `${OAUTH_STATE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    // Cookie access may be blocked alongside Web Storage.
  }
}

function readOAuthState() {
  for (const storageName of ['sessionStorage', 'localStorage']) {
    const storage = browserStorage(storageName);
    const state = safelyGet(storage, OAUTH_STATE_KEY);
    if (!state) continue;
    const createdAt = Number(safelyGet(storage, OAUTH_STATE_CREATED_KEY));
    if (Number.isFinite(createdAt) && createdAt > 0 && Date.now() - createdAt > OAUTH_STATE_MAX_AGE_MS) {
      safelyRemove(storage, OAUTH_STATE_KEY);
      safelyRemove(storage, OAUTH_STATE_CREATED_KEY);
      continue;
    }
    return state;
  }
  return readOAuthStateCookie();
}

function clearOAuthState() {
  safelyRemove(browserStorage('sessionStorage'), OAUTH_STATE_KEY);
  safelyRemove(browserStorage('localStorage'), OAUTH_STATE_KEY);
  safelyRemove(browserStorage('sessionStorage'), OAUTH_STATE_CREATED_KEY);
  safelyRemove(browserStorage('localStorage'), OAUTH_STATE_CREATED_KEY);
  clearOAuthStateCookie();
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
    const createdAt = String(Date.now());
    if (savedInSession) safelySet(browserStorage('sessionStorage'), OAUTH_STATE_CREATED_KEY, createdAt);
    if (savedLocally) safelySet(browserStorage('localStorage'), OAUTH_STATE_CREATED_KEY, createdAt);
    const savedInCookie = writeOAuthStateCookie(state, createdAt);
    if (!savedInSession && !savedLocally && !savedInCookie) {
      throw new Error('Twitch login needs browser storage. Allow site storage for Wormhole and try again.');
    }
    const url = new URL(TWITCH_CONFIG.authorizeUrl);
    url.searchParams.set('client_id', TWITCH_CONFIG.clientId);
    url.searchParams.set('redirect_uri', TWITCH_CONFIG.redirectUri);
    url.searchParams.set('response_type', 'token');
    url.searchParams.set('scope', TWITCH_CONFIG.scopes.join(' '));
    url.searchParams.set('state', state);
    // Forces Twitch to show a fresh consent screen. This prevents an older
    // authorization from silently returning without newly added scopes.
    url.searchParams.set('force_verify', 'true');
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
        cache: 'no-store',
      });
      if (!res.ok) return { valid: false, reason: 'invalid' };
      const validation = await res.json();
      if (validation.client_id !== TWITCH_CONFIG.clientId) {
        return { valid: false, reason: 'wrong_client' };
      }
      const grantedScopes = new Set(validation.scopes ?? []);
      if (!TWITCH_CONFIG.scopes.every((scope) => grantedScopes.has(scope))) {
        return {
          valid: false,
          reason: 'missing_scopes',
          missingScopes: TWITCH_CONFIG.scopes.filter((scope) => !grantedScopes.has(scope)),
        };
      }
      return { valid: true, validation };
    } catch {
      return { valid: false, reason: 'unavailable' };
    }
  },

  async isTokenValid(token) {
    return (await this.validateToken(token)).valid;
  },

  userFromValidation(validation) {
    const id = String(validation?.user_id ?? '').trim();
    const login = String(validation?.login ?? '').trim();
    if (!id || !login) return null;
    return {
      id,
      login,
      display_name: login,
      profile_image_url: '',
      _limitedProfile: true,
    };
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

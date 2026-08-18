import { normalizeTwitchLogin } from './direct-search.js?v=64';

function normalizeHost(hostname) {
  return String(hostname ?? '').trim().toLowerCase();
}

export function buildTwitchPlayerUrl({ hostname, channel, videoId } = {}) {
  const parent = normalizeHost(hostname);
  if (!parent) return null;

  const url = new URL('https://player.twitch.tv/');
  const rawChannel = String(channel ?? '').trim();
  const login = /^[a-zA-Z0-9_]{1,25}$/.test(rawChannel)
    ? normalizeTwitchLogin(rawChannel)
    : null;
  const cleanVideoId = String(videoId ?? '').trim().replace(/^v/i, '');

  if (login) url.searchParams.set('channel', login);
  else if (/^\d+$/.test(cleanVideoId)) url.searchParams.set('video', `v${cleanVideoId}`);
  else return null;

  url.searchParams.set('parent', parent);
  url.searchParams.set('autoplay', 'false');
  url.searchParams.set('muted', 'true');
  return url.toString();
}

export function buildTwitchWatchUrl({ channel, videoId } = {}) {
  const cleanVideoId = String(videoId ?? '').trim().replace(/^v/i, '');
  if (/^\d+$/.test(cleanVideoId)) return `https://www.twitch.tv/videos/${cleanVideoId}`;
  const rawChannel = String(channel ?? '').trim();
  const login = /^[a-zA-Z0-9_]{1,25}$/.test(rawChannel)
    ? normalizeTwitchLogin(rawChannel)
    : null;
  return login ? `https://www.twitch.tv/${login}` : null;
}

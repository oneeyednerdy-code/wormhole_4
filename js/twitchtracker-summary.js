const SUMMARY_ENDPOINT = '/api/twitchtracker-summary';
const summaryCache = new Map();
const CACHE_MS = 5 * 60 * 1000;

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstNumber(data, keys) {
  for (const key of keys) {
    const value = finiteNumber(data?.[key]);
    if (value !== null) return value;
  }
  return null;
}

export function normalizeTwitchTrackerSummary(data, channel = '') {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const averageViewers = firstNumber(data, ['avg_viewers', 'average_viewers', 'averageViewers']);
  return {
    channel: String(channel || data.channel || data.username || '').trim().toLowerCase(),
    averageViewers,
    maxViewers: firstNumber(data, ['max_viewers', 'peak_viewers', 'maxViewers']),
    minutesStreamed: firstNumber(data, ['minutes_streamed', 'minutesStreamed']),
    hoursWatched: firstNumber(data, ['hours_watched', 'hoursWatched']),
    followersGained: firstNumber(data, ['followers', 'followers_gained', 'followersGained']),
    totalFollowers: firstNumber(data, ['followers_total', 'total_followers', 'totalFollowers']),
    rank: firstNumber(data, ['rank']),
    periodDays: 30,
    source: 'TwitchTracker',
  };
}

export async function getTwitchTrackerSummary(channel, { fetchImpl = fetch, signal, force = false } = {}) {
  const normalized = String(channel ?? '').trim().toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(normalized)) throw new Error('Invalid Twitch channel login.');
  const cached = summaryCache.get(normalized);
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const url = new URL(SUMMARY_ENDPOINT, globalThis.location?.origin || 'https://wormhole.local');
  url.searchParams.set('channel', normalized);
  const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, cache: 'no-store', signal });
  if (!response.ok) throw new Error(`TwitchTracker summary unavailable (${response.status}).`);
  const payload = await response.json();
  const value = normalizeTwitchTrackerSummary(payload, normalized);
  if (value) summaryCache.set(normalized, { at: Date.now(), value });
  return value;
}

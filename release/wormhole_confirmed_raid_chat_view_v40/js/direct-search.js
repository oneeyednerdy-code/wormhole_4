/** Accepts a Twitch login, @mention, or channel URL and returns an exact login. */
export function normalizeTwitchLogin(value) {
  let candidate = String(value ?? '').trim();
  if (!candidate) return null;
  candidate = candidate.replace(/^@+/, '');
  candidate = candidate.replace(/^(?:https?:\/\/)?(?:www\.)?twitch\.tv\//i, '');
  candidate = candidate.split(/[/?#]/, 1)[0].trim();
  return /^[a-z0-9_]{1,25}$/i.test(candidate) ? candidate.toLowerCase() : null;
}

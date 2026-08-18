const STORAGE_KEY = 'wormhole_filter_preset_v1';
const ALLOWED_TOLERANCES = new Set(['50', '75', '100', 'all']);
const ALLOWED_GOALS = new Set(['similar', 'growth', 'familiar', 'explore']);

export function normalizeFilterPreset(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return {
    viewerTolerance: ALLOWED_TOLERANCES.has(String(value.viewerTolerance)) ? String(value.viewerTolerance) : '50',
    matchPreset: ALLOWED_GOALS.has(value.matchPreset) ? value.matchPreset : 'similar',
    statuses: Array.isArray(value.statuses)
      ? value.statuses.filter((status) => ['partner', 'affiliate'].includes(status))
      : ['partner', 'affiliate'],
    onlyFollowing: Boolean(value.onlyFollowing),
    openChatOnly: value.openChatOnly !== false,
    sameTeam: Boolean(value.sameTeam),
    matchStreamTags: value.matchStreamTags !== false,
    language: String(value.language ?? ''),
    tags: String(value.tags ?? '').slice(0, 500),
    genres: Array.isArray(value.genres) ? value.genres.map(String).slice(0, 20) : [],
    categories: Array.isArray(value.categories)
      ? value.categories.filter((category) => category?.id && category?.name).slice(0, 50).map((category) => ({
        id: String(category.id),
        name: String(category.name),
        source: category.source === 'genre' ? 'genre' : 'manual',
      }))
      : [],
  };
}

export function saveFilterPreset(value, storage = localStorage) {
  const normalized = normalizeFilterPreset(value);
  if (!normalized) throw new Error('Invalid filter preset.');
  storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function loadFilterPreset(storage = localStorage) {
  try {
    return normalizeFilterPreset(JSON.parse(storage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return null;
  }
}

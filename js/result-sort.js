export const RESULT_SORT_OPTIONS = [
  'recommended',
  'following-first',
  'tag-match',
  'viewers-high',
  'viewers-low',
  'ending-soon',
  'just-started',
];

function score(match) {
  return Number.isFinite(match?.matchScore) ? match.matchScore : 0;
}

function viewers(match) {
  const count = Number(match?.stream?.viewer_count);
  return Number.isFinite(count) ? count : 0;
}

function startedAt(match) {
  const timestamp = new Date(match?.stream?.started_at).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function recommendedFirst(a, b) {
  return score(b) - score(a);
}

function compareStarts(a, b, newestFirst) {
  const aStarted = startedAt(a);
  const bStarted = startedAt(b);
  if (aStarted === null && bStarted === null) return recommendedFirst(a, b);
  if (aStarted === null) return 1;
  if (bStarted === null) return -1;
  const difference = newestFirst ? bStarted - aStarted : aStarted - bStarted;
  return difference || recommendedFirst(a, b);
}

export function sortRaidMatches(matches, mode = 'recommended') {
  const sorted = Array.isArray(matches) ? [...matches] : [];

  switch (mode) {
    case 'following-first':
      return sorted.sort((a, b) =>
        Number(Boolean(b?.stream?.is_followed)) - Number(Boolean(a?.stream?.is_followed)) ||
        recommendedFirst(a, b)
      );
    case 'tag-match':
      return sorted.sort((a, b) =>
        Number(b?.searchedTagMatchPercent ?? 0) - Number(a?.searchedTagMatchPercent ?? 0) ||
        Number(b?.searchedTagMatchCount ?? 0) - Number(a?.searchedTagMatchCount ?? 0) ||
        Number(b?.meaningfulSharedTags?.length ?? 0) - Number(a?.meaningfulSharedTags?.length ?? 0) ||
        recommendedFirst(a, b)
      );
    case 'viewers-high':
      return sorted.sort((a, b) => viewers(b) - viewers(a) || recommendedFirst(a, b));
    case 'viewers-low':
      return sorted.sort((a, b) => viewers(a) - viewers(b) || recommendedFirst(a, b));
    case 'ending-soon':
      return sorted.sort((a, b) => compareStarts(a, b, false));
    case 'just-started':
      return sorted.sort((a, b) => compareStarts(a, b, true));
    case 'recommended':
    default:
      return sorted.sort(recommendedFirst);
  }
}

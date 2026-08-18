import { ViewerHistory } from './viewer-history.js?v=66';
import { isLanguageTag } from './language-tags.js?v=66';

// Base weights are used when automatic tag comparison is disabled or the
// logged-in stream has no meaningful non-language tags. When tags are
// available, 15% shifts to tag similarity while all weights still sum to 1.
const WEIGHT_VIEWER_COUNT = 0.5;
const WEIGHT_DURATION = 0.2;
const WEIGHT_AVERAGE_VIEWERS = 0.3;

function liveDurationMs(stream) {
  return Date.now() - new Date(stream.started_at).getTime();
}

function percentDiff(a, b) {
  const base = Math.max(a, 1); // avoid divide-by-zero for 0-viewer streams
  return (Math.abs(a - b) / base) * 100;
}

function computeScore({ liveViewerDiffPercent, averageViewerDiffPercent, durationDiffMs }) {
  const viewerScore = Math.max(0, 100 - liveViewerDiffPercent);

  const durationDiffHours = durationDiffMs / 1000 / 60 / 60;
  // Being live for a wildly different amount of time matters less than
  // viewer count; cap the penalty at 6 hours of difference.
  const durationScore = Math.max(0, 100 - (durationDiffHours / 6) * 100);

  const averageScore = Math.max(0, 100 - averageViewerDiffPercent);

  return { viewerScore, durationScore, averageScore };
}

function normalizeTags(tags) {
  const byKey = new Map();
  for (const tag of tags ?? []) {
    const clean = String(tag ?? '').trim();
    if (clean && !byKey.has(clean.toLowerCase())) byKey.set(clean.toLowerCase(), clean);
  }
  return byKey;
}

export function compareStreamTags(myTags, candidateTags) {
  const mine = normalizeTags(myTags);
  const theirs = normalizeTags(candidateTags);
  const sharedTags = [...mine].filter(([key]) => theirs.has(key)).map(([, tag]) => tag);
  const meaningfulMine = [...mine.values()].filter((tag) => !isLanguageTag(tag));
  const meaningfulSharedTags = sharedTags.filter((tag) => !isLanguageTag(tag));
  const meaningfulTheirs = [...theirs.values()].filter((tag) => !isLanguageTag(tag));
  const unionSize = new Set([
    ...meaningfulMine.map((tag) => tag.toLowerCase()),
    ...meaningfulTheirs.map((tag) => tag.toLowerCase()),
  ]).size;
  const recall = meaningfulMine.length
    ? meaningfulSharedTags.length / meaningfulMine.length
    : null;
  const jaccard = unionSize ? meaningfulSharedTags.length / unionSize : null;
  return {
    sharedTags,
    meaningfulSharedTags,
    similarityPercent: recall == null
      ? null
      : ((recall * 0.7) + ((jaccard ?? 0) * 0.3)) * 100,
  };
}

function combinedScore(scores, tagSimilarityPercent) {
  if (!Number.isFinite(tagSimilarityPercent)) {
    return (
      scores.viewerScore * WEIGHT_VIEWER_COUNT +
      scores.durationScore * WEIGHT_DURATION +
      scores.averageScore * WEIGHT_AVERAGE_VIEWERS
    );
  }
  return (
    scores.viewerScore * 0.4 +
    scores.durationScore * 0.2 +
    scores.averageScore * 0.25 +
    tagSimilarityPercent * 0.15
  );
}

/**
 * Hard filters (candidates outside these are excluded entirely, not just
 * scored lower):
 * - minViewers / maxViewers: current live viewer count bounds.
 * - allowedBroadcasterTypes: Set/array of 'partner' | 'affiliate' | 'none'
 *   to include. Candidates need a `broadcaster_type` field set by the
 *   caller (Twitch's /streams endpoint doesn't include it — see
 *   TwitchApi.getBroadcasterTypes).
 * - requireSharedTeam: only keep candidates with a non-empty
 *   `shared_team_names` array, set by the caller (see
 *   TwitchApi.getTeamMembershipsForUsers). Exported separately so callers
 *   can narrow the candidate list *before* doing the (uncached, one-call-
 *   per-channel) team lookup, rather than fetching teams for everyone.
 * - requireFollowed: only keep candidates whose follow lookup set
 *   `is_followed` to true.
 * - requiredTags: array of tag strings (case-insensitive) — a candidate
 *   must have at least one of these in its own `tags` array (the free-text
 *   tags Twitch streamers set, e.g. "Speedrun", "Cozy", "English").
 * - requiredLanguageTag: an independently required language tag. This keeps
 *   a broad default such as English from satisfying a custom tag search.
 */
export function applyHardFilters(
  candidates,
  {
    minViewers = null,
    maxViewers = null,
    allowedBroadcasterTypes = null,
    requireFollowed = false,
    requireSharedTeam = false,
    requiredTags = null,
    requiredLanguageTag = null,
  } = {}
) {
  const typeFilter = allowedBroadcasterTypes ? new Set(allowedBroadcasterTypes) : null;
  const tagFilter = requiredTags?.length
    ? new Set(requiredTags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))
    : null;
  const languageKey = String(requiredLanguageTag ?? '').trim().toLowerCase();

  return candidates.filter((s) => {
    if (minViewers != null && s.viewer_count < minViewers) return false;
    if (maxViewers != null && s.viewer_count > maxViewers) return false;
    if (typeFilter && !typeFilter.has(s.broadcaster_type ?? 'none')) return false;
    if (requireFollowed && s.is_followed !== true) return false;
    if (requireSharedTeam && !(s.shared_team_names?.length > 0)) return false;
    if (tagFilter) {
      const streamTags = (s.tags ?? []).map((t) => String(t).trim().toLowerCase());
      if (!streamTags.some((t) => tagFilter.has(t))) return false;
    }
    if (languageKey) {
      const streamTags = (s.tags ?? []).map((t) => String(t).trim().toLowerCase());
      if (!streamTags.includes(languageKey)) return false;
    }
    return true;
  });
}

/**
 * Scores and ranks candidate streams as raid targets for myStream,
 * matching on: same game/category (already filtered by caller), viewer
 * count closeness, stream-duration closeness, and estimated average
 * viewership.
 *
 * See applyHardFilters for the filter options accepted here — they're
 * applied again internally so callers can pass raw candidates directly
 * if they don't need to pre-filter for a team lookup.
 */
export function findRaidMatches(
  myStream,
  candidates,
  {
    viewerTolerancePercent = 50,
    ignoreViewerTolerance = false,
    minViewers = null,
    maxViewers = null,
    allowedBroadcasterTypes = null,
    requireFollowed = false,
    requireSharedTeam = false,
    requiredTags = null,
    requiredLanguageTag = null,
    compareTags = true,
    categoryMatchApplied = true,
    primaryCategoryId = myStream.game_id,
    matchPreset = 'similar',
  } = {}
) {
  const filtered = applyHardFilters(candidates, {
    minViewers,
    maxViewers,
    allowedBroadcasterTypes,
    requireFollowed,
    requireSharedTeam,
    requiredTags,
    requiredLanguageTag,
  });

  // Record fresh samples for everyone we just looked at, so the local
  // average-viewership estimate keeps improving over time.
  const samples = {};
  if (!myStream.isHistoricalReference) {
    samples[myStream.user_id] = {
      viewerCount: myStream.viewer_count,
      streamStartedAt: myStream.started_at,
    };
  }
  for (const s of filtered) {
    samples[s.user_id] = { viewerCount: s.viewer_count, streamStartedAt: s.started_at };
  }
  ViewerHistory.recordSamples(samples);

  const myAvgRecord = myStream.isHistoricalReference
    ? null
    : ViewerHistory.getAverage(myStream.user_id);
  const myEstimatedAverage = myAvgRecord?.average ?? myStream.viewer_count;

  const results = [];

  for (const candidate of filtered) {
    if (candidate.user_id === myStream.user_id) continue;

    const avgRecord = ViewerHistory.getAverage(candidate.user_id);
    const estimatedAverage = avgRecord?.average ?? candidate.viewer_count;
    const averageIsHistorical = (avgRecord?.sampleCount ?? 0) >= 3;

    const liveViewerDiffPercent = percentDiff(myStream.viewer_count, candidate.viewer_count);
    const averageViewerDiffPercent = percentDiff(myEstimatedAverage, estimatedAverage);

    // Skip channels wildly outside the requested tolerance band - raiding
    // a streamer 10x your size (or 1/10th) usually isn't a meaningful match.
    if (!ignoreViewerTolerance && liveViewerDiffPercent > viewerTolerancePercent) continue;

    const durationDiffMs = Math.abs(liveDurationMs(myStream) - liveDurationMs(candidate));

    const scoreComponents = computeScore({
      liveViewerDiffPercent,
      averageViewerDiffPercent,
      durationDiffMs,
    });
    const tagComparison = compareStreamTags(myStream.tags, candidate.tags);
    const tagComparisonApplied = compareTags && Number.isFinite(tagComparison.similarityPercent);
    let matchScore = combinedScore(
      scoreComponents,
      tagComparisonApplied ? tagComparison.similarityPercent : null
    );
    const isPrimaryCategory = Boolean(primaryCategoryId) && candidate.game_id === primaryCategoryId;
    if (categoryMatchApplied) matchScore += isPrimaryCategory ? 5 : 0;
    let goalMatchReason = null;
    if (matchPreset === 'growth') {
      const ratio = candidate.viewer_count / Math.max(myStream.viewer_count, 1);
      const growthScore = Math.max(0, 100 - Math.abs(1.5 - ratio) * 100);
      matchScore = matchScore * 0.4 + growthScore * 0.6;
      goalMatchReason = `Growth goal: ${Math.round(ratio * 100)}% of your live audience`;
    } else if (matchPreset === 'familiar') {
      const familiarityScore =
        (candidate.is_followed ? 70 : 0) +
        (candidate.shared_team_names?.length ? 20 : 0) +
        Math.min(10, tagComparison.meaningfulSharedTags.length * 5);
      matchScore = matchScore * 0.6 + familiarityScore * 0.4;
      if (candidate.is_followed) goalMatchReason = 'Familiar goal: channel you already follow';
      else if (candidate.shared_team_names?.length) goalMatchReason = 'Familiar goal: shared Twitch team';
      else if (tagComparison.meaningfulSharedTags.length) goalMatchReason = 'Familiar goal: shared community tags';
    } else if (matchPreset === 'explore') {
      const isNewChannel = !candidate.is_followed;
      const isNewCategory = Boolean(primaryCategoryId) && !isPrimaryCategory;
      const noveltyScore = (isNewChannel ? 60 : 0) + (isNewCategory ? 40 : 0);
      matchScore = matchScore * 0.6 + noveltyScore * 0.4;
      if (isNewChannel && isNewCategory) goalMatchReason = 'Explore goal: new channel and category';
      else if (isNewChannel) goalMatchReason = 'Explore goal: channel you do not follow';
      else if (isNewCategory) goalMatchReason = 'Explore goal: different category';
    }
    matchScore = Math.min(100, matchScore);

    results.push({
      stream: candidate,
      estimatedAverageViewers: estimatedAverage,
      averageIsHistorical,
      historyConfidence: avgRecord?.confidence ?? 'New estimate',
      historySessionCount: avgRecord?.sessionCount ?? 0,
      matchScore,
      viewerCountDiffPercent: liveViewerDiffPercent,
      averageViewerCountDiffPercent: averageViewerDiffPercent,
      streamDurationDiffMs: durationDiffMs,
      sharedTags: tagComparison.sharedTags,
      meaningfulSharedTags: tagComparison.meaningfulSharedTags,
      tagSimilarityPercent: tagComparison.similarityPercent,
      tagComparisonApplied,
      categoryMatchApplied,
      isPrimaryCategory,
      matchPreset,
      goalMatchReason,
    });
  }

  results.sort((a, b) => b.matchScore - a.matchScore);
  return results;
}

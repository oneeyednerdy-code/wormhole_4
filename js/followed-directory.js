import { getSearchedTagMatch } from './tag-display.js?v=91';
import { ViewerHistory } from './viewer-history.js?v=91';

/** Converts followed live streams into the result-card shape without applying matching filters. */
export function buildFollowedDirectoryMatches(streams, searchedTags = []) {
  const liveStreams = streams ?? [];
  const historyAvailable = typeof globalThis.localStorage !== 'undefined';
  if (historyAvailable) {
    ViewerHistory.recordSamples(Object.fromEntries(liveStreams.map((stream) => [
      stream.user_id,
      { viewerCount: stream.viewer_count, streamStartedAt: stream.started_at },
    ])));
  }
  const averages = historyAvailable
    ? ViewerHistory.getAverages(liveStreams.map((stream) => stream.user_id))
    : new Map();
  return liveStreams.map((stream) => {
    const history = averages.get(stream.user_id) ?? null;
    return {
      stream,
      directoryListing: true,
      matchScore: 0,
      categoryMatchApplied: false,
      tagComparisonApplied: false,
      sharedTags: [],
      meaningfulSharedTags: [],
      viewerCountDiffPercent: Number.POSITIVE_INFINITY,
      averageViewerCountDiffPercent: Number.POSITIVE_INFINITY,
      streamDurationDiffMs: Number.POSITIVE_INFINITY,
      estimatedAverageViewers: history?.average ?? (Number(stream.viewer_count) || 0),
      averageIsHistorical: (history?.sampleCount ?? 0) >= 3,
      historyConfidence: history?.confidence ?? 'New estimate',
      historySessionCount: history?.sessionCount ?? 0,
      historyWindowDays: history?.windowDays ?? 30,
      ...getSearchedTagMatch(stream.tags, searchedTags),
    };
  });
}

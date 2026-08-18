/** Converts followed live streams into the result-card shape without applying matching filters. */
export function buildFollowedDirectoryMatches(streams) {
  return (streams ?? []).map((stream) => ({
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
    estimatedAverageViewers: Number(stream.viewer_count) || 0,
    averageIsHistorical: false,
  }));
}

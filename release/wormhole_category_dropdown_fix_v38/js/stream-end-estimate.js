export function parseTwitchDuration(duration) {
  const match = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(duration ?? '');
  if (!match) return null;
  return ((Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0)) * 60 + Number(match[3] ?? 0)) * 1000;
}

/** Estimates a live stream's end using the median duration of recent VODs. */
export function estimateStreamEnd(startedAt, videos) {
  const startedAtMs = new Date(startedAt).getTime();
  if (!Number.isFinite(startedAtMs)) return null;
  const durations = videos
    .map((video) => parseTwitchDuration(video.duration))
    .filter((duration) => Number.isFinite(duration) && duration > 0)
    .sort((a, b) => a - b);
  if (!durations.length) return null;

  const middle = Math.floor(durations.length / 2);
  const medianDurationMs = durations.length % 2
    ? durations[middle]
    : (durations[middle - 1] + durations[middle]) / 2;

  return {
    estimatedEndAt: new Date(startedAtMs + medianDurationMs).toISOString(),
    medianDurationMs,
    sampleCount: durations.length,
  };
}

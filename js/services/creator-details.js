import { getTwitchTrackerSummary } from '../twitchtracker-summary.js?v=90';

/**
 * Loads expensive creator details only when the UI asks for them.
 * A failure in one provider does not block the remaining creator data.
 */
export async function loadCreatorDetails(api, stream, { tracker = getTwitchTrackerSummary } = {}) {
  if (!api || !stream?.user_id) throw new Error('Creator details require an API client and Twitch user.');

  const [videosResult, clipsResult, scheduleResult, profileResult, trackerResult] = await Promise.allSettled([
    api.getBroadcastHistory(stream.user_id, { days: 30, maxResults: 100 }),
    api.getRecentClips(stream.user_id, { days: 30, maxResults: 3 }),
    api.getScheduleContext(stream.user_id),
    api.getBroadcasterProfile(stream.user_id),
    tracker(stream.user_login),
  ]);

  return {
    videos: videosResult.status === 'fulfilled' ? videosResult.value : [],
    clips: clipsResult.status === 'fulfilled' ? clipsResult.value : [],
    scheduleContext: scheduleResult.status === 'fulfilled'
      ? scheduleResult.value
      : { current: null, next: null },
    profile: profileResult.status === 'fulfilled' ? profileResult.value : null,
    trackerSummary: trackerResult.status === 'fulfilled' ? trackerResult.value : null,
    failures: {
      videos: videosResult.status === 'rejected' ? videosResult.reason : null,
      clips: clipsResult.status === 'rejected' ? clipsResult.reason : null,
      schedule: scheduleResult.status === 'rejected' ? scheduleResult.reason : null,
      profile: profileResult.status === 'rejected' ? profileResult.reason : null,
      tracker: trackerResult.status === 'rejected' ? trackerResult.reason : null,
    },
  };
}

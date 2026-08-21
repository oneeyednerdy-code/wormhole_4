import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCreatorDetails } from '../js/services/creator-details.js';

test('creator details combines Twitch and tracker data without making one failure fatal', async () => {
  const api = {
    getBroadcastHistory: async () => [{ id: 'vod-1' }],
    getRecentClips: async () => { throw new Error('clips unavailable'); },
    getScheduleContext: async () => ({ next: { title: 'Next' } }),
    getBroadcasterProfile: async () => ({ created_at: '2020-01-01T00:00:00Z' }),
  };
  const result = await loadCreatorDetails(api, { user_id: '1', user_login: 'creator' }, {
    tracker: async () => ({ averageViewers: 25 }),
  });
  assert.equal(result.videos.length, 1);
  assert.deepEqual(result.clips, []);
  assert.equal(result.scheduleContext.next.title, 'Next');
  assert.equal(result.trackerSummary.averageViewers, 25);
  assert.match(result.failures.clips.message, /clips unavailable/);
});

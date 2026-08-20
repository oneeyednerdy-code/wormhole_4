import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RAID_COUNTDOWN_MS,
  createRaidCountdown,
  getRaidCountdownSnapshot,
  twitchChannelUrl,
} from '../js/raid-countdown.js';

test('creates Twitch\'s 90-second raid countdown from the API timestamp', () => {
  const raid = createRaidCountdown({
    userId: '42', userName: 'Raid Friend', userLogin: 'raidfriend',
    createdAt: '2026-08-17T12:00:00Z',
  });
  assert.equal(raid.deadline - raid.startedAt, RAID_COUNTDOWN_MS);
  assert.equal(raid.userLogin, 'raidfriend');
});

test('reports remaining seconds, progress, and completion', () => {
  const raid = { startedAt: 1_000, deadline: 91_000 };
  assert.deepEqual(getRaidCountdownSnapshot(raid, 1_000), {
    remainingSeconds: 90, progressPercent: 0, complete: false,
  });
  assert.deepEqual(getRaidCountdownSnapshot(raid, 46_000), {
    remainingSeconds: 45, progressPercent: 50, complete: false,
  });
  assert.deepEqual(getRaidCountdownSnapshot(raid, 91_000), {
    remainingSeconds: 0, progressPercent: 100, complete: true,
  });
});

test('builds the destination Twitch channel URL safely', () => {
  assert.equal(twitchChannelUrl('raid_friend'), 'https://www.twitch.tv/raid_friend');
});

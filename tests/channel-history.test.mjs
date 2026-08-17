import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}

globalThis.localStorage = new MemoryStorage();
const { ChannelHistory } = await import('../js/channel-history.js');

test('channel history records category changes and follower growth', () => {
  ChannelHistory.clearAll();
  const stream = {
    user_id: 'channel-1',
    user_name: 'Example',
    game_id: 'game-1',
    game_name: 'First Game',
    viewer_count: 20,
  };
  ChannelHistory.record(stream, 100, new Date('2026-08-01T00:00:00Z'));
  ChannelHistory.record(
    { ...stream, game_id: 'game-2', game_name: 'Second Game' },
    125,
    new Date('2026-08-01T01:00:00Z')
  );

  const summary = ChannelHistory.getSummary('channel-1');
  assert.equal(summary.sampleCount, 2);
  assert.deepEqual(summary.categories, ['Second Game', 'First Game']);
  assert.equal(summary.followerDelta, 25);
});

test('channel history avoids duplicate snapshots within twelve hours', () => {
  ChannelHistory.clearAll();
  const stream = {
    user_id: 'channel-2', user_name: 'Example', game_id: 'game-1',
    game_name: 'Same Game', viewer_count: 10,
  };
  ChannelHistory.record(stream, 50, new Date('2026-08-01T00:00:00Z'));
  ChannelHistory.record(stream, 51, new Date('2026-08-01T02:00:00Z'));
  assert.equal(ChannelHistory.getSummary('channel-2').sampleCount, 1);
});

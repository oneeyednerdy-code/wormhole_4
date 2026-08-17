import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() {
    this.data = new Map();
    this.data.set('wormhole_storage_choice_v1', 'history');
  }
  getItem(key) {
    return this.data.has(key) ? this.data.get(key) : null;
  }
  setItem(key, value) {
    this.data.set(key, String(value));
  }
  removeItem(key) {
    this.data.delete(key);
  }
  clear() {
    this.data.clear();
    this.data.set('wormhole_storage_choice_v1', 'history');
  }
}

globalThis.localStorage = new MemoryStorage();
const { PreviousStreamHistory } = await import('../js/previous-stream-history.js');

function stream(id, viewers = 20) {
  return {
    id,
    user_id: 'creator',
    title: `Stream ${id}`,
    game_id: `game-${id}`,
    game_name: `Game ${id}`,
    started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    viewer_count: viewers,
    tags: ['English', 'Cozy'],
  };
}

test('stores stream-specific category and viewer data', () => {
  localStorage.clear();
  PreviousStreamHistory.record(stream('abc', 24));
  const saved = PreviousStreamHistory.getByStreamId('abc');
  assert.equal(saved.gameId, 'game-abc');
  assert.equal(saved.gameName, 'Game abc');
  assert.equal(saved.averageViewers, 24);
  assert.equal(saved.sampleCount, 1);
  assert.deepEqual(saved.tags, ['English', 'Cozy']);
});

test('retains only the five most recent stream sessions', () => {
  localStorage.clear();
  for (let index = 1; index <= 6; index += 1) {
    PreviousStreamHistory.record(stream(String(index), index));
  }
  const recent = PreviousStreamHistory.getRecent('creator');
  assert.equal(recent.length, 5);
  assert.equal(recent[0].streamId, '6');
  assert.equal(PreviousStreamHistory.getByStreamId('1'), null);
});

test('does not duplicate rapid samples from the same stream', () => {
  localStorage.clear();
  PreviousStreamHistory.record(stream('same', 10));
  PreviousStreamHistory.record(stream('same', 30));
  const saved = PreviousStreamHistory.getByStreamId('same');
  assert.equal(saved.sampleCount, 1);
  assert.equal(saved.averageViewers, 10);
});

test('remembers a corrected category and viewer baseline for a VOD', () => {
  localStorage.clear();
  PreviousStreamHistory.saveReference({
    streamId: 'vod-stream-1',
    userId: 'creator',
    title: 'An older stream',
    gameId: 'correct-game',
    gameName: 'Correct Game',
    startedAt: new Date().toISOString(),
    viewerBaseline: 37,
  });

  const saved = PreviousStreamHistory.getByStreamId('vod-stream-1');
  assert.equal(saved.gameId, 'correct-game');
  assert.equal(saved.gameName, 'Correct Game');
  assert.equal(saved.categorySource, 'manual');
  assert.equal(saved.averageViewers, 37);
  assert.equal(saved.baselineSource, 'manual');
});

test('remembers when category matching was intentionally cleared', () => {
  localStorage.clear();
  PreviousStreamHistory.saveReference({
    streamId: 'tags-only-vod',
    userId: 'creator',
    title: 'Tags everywhere',
    startedAt: new Date().toISOString(),
    viewerBaseline: 42,
    categoryCleared: true,
  });

  const saved = PreviousStreamHistory.getByStreamId('tags-only-vod');
  assert.equal(saved.gameId, null);
  assert.equal(saved.gameName, '');
  assert.equal(saved.categorySource, 'cleared');
  assert.equal(saved.averageViewers, 42);
});

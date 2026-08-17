import test from 'node:test';
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() {
    this.data = new Map();
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
  }
}

globalThis.localStorage = new MemoryStorage();

const { findRaidMatches } = await import('../js/raid-match.js');
const { ViewerHistory } = await import('../js/viewer-history.js');

const startedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

function stream(id, viewers) {
  return {
    user_id: id,
    user_name: id,
    user_login: id,
    viewer_count: viewers,
    started_at: startedAt,
    broadcaster_type: 'none',
    tags: [],
  };
}

test('the default viewer band includes exactly 50% through 150%', () => {
  localStorage.clear();
  const mine = stream('mine', 100);
  const matches = findRaidMatches(mine, [
    stream('below', 49),
    stream('lower-edge', 50),
    stream('upper-edge', 150),
    stream('above', 151),
  ]);
  assert.deepEqual(new Set(matches.map((match) => match.stream.user_id)), new Set([
    'lower-edge',
    'upper-edge',
  ]));
});

test('show-all mode bypasses viewer tolerance', () => {
  localStorage.clear();
  const matches = findRaidMatches(stream('mine', 10), [stream('large', 1000)], {
    ignoreViewerTolerance: true,
  });
  assert.equal(matches.length, 1);
});

test('live and historical viewer similarity contribute independently', () => {
  localStorage.clear();
  const now = new Date().toISOString();
  localStorage.setItem('wormhole_viewer_history_v2', JSON.stringify({
    mine: [100, 100, 100].map((viewerCount) => ({ viewerCount, sampledAt: now })),
    average_match: [100, 100, 100].map((viewerCount) => ({ viewerCount, sampledAt: now })),
    live_match: [150, 150, 150].map((viewerCount) => ({ viewerCount, sampledAt: now })),
  }));

  const matches = findRaidMatches(
    stream('mine', 100),
    [stream('average_match', 150), stream('live_match', 100)],
    { ignoreViewerTolerance: true }
  );

  assert.equal(matches[0].stream.user_id, 'live_match');
  assert.notEqual(matches[0].viewerCountDiffPercent, matches[0].averageViewerCountDiffPercent);
});

test('viewer history ignores rapid duplicate samples', () => {
  localStorage.clear();
  ViewerHistory.recordSamples({ channel: { viewerCount: 25, streamStartedAt: startedAt } });
  ViewerHistory.recordSamples({ channel: { viewerCount: 30, streamStartedAt: startedAt } });
  assert.equal(ViewerHistory.getAverage('channel').sampleCount, 1);
  assert.equal(ViewerHistory.getAverage('channel').average, 25);
});

test('offline reference searches do not record synthetic viewer samples', () => {
  localStorage.clear();
  const historical = { ...stream('mine', 42), isHistoricalReference: true };
  findRaidMatches(historical, [stream('candidate', 40)]);
  assert.equal(ViewerHistory.getAverage('mine'), null);
  assert.equal(ViewerHistory.getAverage('candidate').sampleCount, 1);
});

test('a manually entered offline baseline overrides older saved averages', () => {
  localStorage.clear();
  const now = new Date().toISOString();
  localStorage.setItem('wormhole_viewer_history_v2', JSON.stringify({
    mine: [100, 100, 100].map((viewerCount) => ({ viewerCount, sampledAt: now })),
  }));
  const historical = { ...stream('mine', 40), isHistoricalReference: true };
  const matches = findRaidMatches(
    historical,
    [stream('entered-baseline', 40), stream('old-saved-average', 100)],
    { ignoreViewerTolerance: true }
  );
  assert.equal(matches[0].stream.user_id, 'entered-baseline');
});

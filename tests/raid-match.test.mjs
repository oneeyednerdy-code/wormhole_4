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

const { compareStreamTags, findRaidMatches } = await import('../js/raid-match.js');
const { ViewerHistory } = await import('../js/viewer-history.js');

const startedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

function stream(id, viewers, tags = []) {
  return {
    user_id: id,
    user_name: id,
    user_login: id,
    viewer_count: viewers,
    started_at: startedAt,
    broadcaster_type: 'none',
    tags,
  };
}

test('compares logged-in and candidate tags case-insensitively', () => {
  const comparison = compareStreamTags(
    ['English', 'LGBTQIA+', 'Cozy'],
    ['english', 'lgbtqia+', 'FirstPlaythrough']
  );
  assert.deepEqual(comparison.sharedTags, ['English', 'LGBTQIA+']);
  assert.deepEqual(comparison.meaningfulSharedTags, ['LGBTQIA+']);
  assert.equal(Math.round(comparison.similarityPercent), 45);
});

test('language-only overlap is displayed but does not affect tag similarity', () => {
  const comparison = compareStreamTags(['English'], ['english', 'Cozy']);
  assert.deepEqual(comparison.sharedTags, ['English']);
  assert.deepEqual(comparison.meaningfulSharedTags, []);
  assert.equal(comparison.similarityPercent, null);
});

test('meaningful shared tags improve recommendations and can be disabled', () => {
  localStorage.clear();
  const mine = stream('mine', 100, ['English', 'LGBTQIA+']);
  const matching = stream('tag-match', 100, ['english', 'lgbtqia+']);
  const different = stream('no-tag-match', 100, ['english', 'Speedrun']);
  const scored = findRaidMatches(mine, [different, matching]);
  assert.equal(scored[0].stream.user_id, 'tag-match');
  assert.equal(scored[0].tagComparisonApplied, true);
  assert.deepEqual(scored[0].meaningfulSharedTags, ['LGBTQIA+']);

  const disabled = findRaidMatches(mine, [different, matching], { compareTags: false });
  assert.equal(disabled[0].matchScore, disabled[1].matchScore);
  assert.equal(disabled.every((match) => !match.tagComparisonApplied), true);
});

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

test('following-only excludes channels the user does not follow', () => {
  localStorage.clear();
  const followed = { ...stream('followed', 100), is_followed: true };
  const notFollowed = { ...stream('not-followed', 100), is_followed: false };
  const matches = findRaidMatches(stream('mine', 100), [notFollowed, followed], {
    requireFollowed: true,
  });
  assert.deepEqual(matches.map((match) => match.stream.user_id), ['followed']);
});

test('growth goal prioritizes a channel near 150% of the current audience', () => {
  localStorage.clear();
  const mine = stream('mine', 100);
  const sameSize = stream('same-size', 100);
  const stepUp = stream('step-up', 150);
  const similar = findRaidMatches(mine, [stepUp, sameSize], { matchPreset: 'similar' });
  const growth = findRaidMatches(mine, [sameSize, stepUp], { matchPreset: 'growth' });

  assert.equal(similar[0].stream.user_id, 'same-size');
  assert.equal(growth[0].stream.user_id, 'step-up');
  assert.match(growth[0].goalMatchReason, /150%/);
});

test('familiar goal materially prioritizes a followed channel', () => {
  localStorage.clear();
  const mine = stream('mine', 100, ['Cozy']);
  const unfamiliar = { ...stream('unfamiliar', 100, ['Speedrun']), is_followed: false };
  const familiar = { ...stream('familiar', 130, ['Cozy']), is_followed: true };
  const matches = findRaidMatches(mine, [unfamiliar, familiar], { matchPreset: 'familiar' });

  assert.equal(matches[0].stream.user_id, 'familiar');
  assert.match(matches[0].goalMatchReason, /already follow/);
});

test('explore goal materially prioritizes an unfollowed channel in a different selected category', () => {
  localStorage.clear();
  const mine = { ...stream('mine', 100), game_id: 'primary' };
  const familiar = { ...stream('familiar', 100), game_id: 'primary', is_followed: true };
  const discovery = { ...stream('discovery', 130), game_id: 'extra', is_followed: false };
  const matches = findRaidMatches(mine, [familiar, discovery], {
    matchPreset: 'explore',
    primaryCategoryId: 'primary',
    categoryMatchApplied: true,
  });

  assert.equal(matches[0].stream.user_id, 'discovery');
  assert.match(matches[0].goalMatchReason, /new channel and category/);
});

test('custom 75% and 100% viewer bands include their exact boundaries', () => {
  localStorage.clear();
  const mine = stream('mine', 100);
  const candidates = [
    stream('quarter', 25),
    stream('double', 200),
    stream('too-high-for-75', 176),
  ];
  const seventyFive = findRaidMatches(mine, candidates, { viewerTolerancePercent: 75 });
  const oneHundred = findRaidMatches(mine, candidates, { viewerTolerancePercent: 100 });
  assert.deepEqual(
    new Set(seventyFive.map((match) => match.stream.user_id)),
    new Set(['quarter'])
  );
  assert.deepEqual(
    new Set(oneHundred.map((match) => match.stream.user_id)),
    new Set(['quarter', 'double', 'too-high-for-75'])
  );
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

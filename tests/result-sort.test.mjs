import test from 'node:test';
import assert from 'node:assert/strict';
import { RESULT_SORT_OPTIONS, sortRaidMatches } from '../js/result-sort.js';

function match(id, viewerCount, matchScore, startedAt) {
  return {
    matchScore,
    stream: { user_id: id, viewer_count: viewerCount, started_at: startedAt },
  };
}

const matches = [
  match('middle', 50, 90, '2026-08-17T12:00:00Z'),
  match('oldest', 100, 70, '2026-08-17T08:00:00Z'),
  match('newest', 10, 80, '2026-08-17T14:00:00Z'),
];

test('publishes every results sorting option', () => {
  assert.deepEqual(RESULT_SORT_OPTIONS, [
    'recommended', 'following-first', 'tag-match', 'viewers-high', 'viewers-low', 'average-high', 'average-low', 'ending-soon', 'just-started',
  ]);
});

test('sorts by typed-tag match percentage and count', () => {
  const source = [
    { ...matches[0], searchedTagMatchPercent: 50, searchedTagMatchCount: 1 },
    { ...matches[1], searchedTagMatchPercent: 100, searchedTagMatchCount: 2 },
    { ...matches[2], searchedTagMatchPercent: 0, searchedTagMatchCount: 0 },
  ];
  assert.deepEqual(sortRaidMatches(source, 'tag-match').map((m) => m.stream.user_id), ['oldest', 'middle', 'newest']);
});

test('sorts followed channels first and recommendations within each group', () => {
  const source = [
    { ...matches[0], stream: { ...matches[0].stream, is_followed: false } },
    { ...matches[1], stream: { ...matches[1].stream, is_followed: true } },
    { ...matches[2], stream: { ...matches[2].stream, is_followed: true } },
  ];
  assert.deepEqual(
    sortRaidMatches(source, 'following-first').map((m) => m.stream.user_id),
    ['newest', 'oldest', 'middle']
  );
});

test('sorts by recommendation and viewer count in both directions', () => {
  assert.deepEqual(sortRaidMatches(matches, 'recommended').map((m) => m.stream.user_id), ['middle', 'newest', 'oldest']);
  assert.deepEqual(sortRaidMatches(matches, 'viewers-high').map((m) => m.stream.user_id), ['oldest', 'middle', 'newest']);
  assert.deepEqual(sortRaidMatches(matches, 'viewers-low').map((m) => m.stream.user_id), ['newest', 'middle', 'oldest']);
});

test('sorts by rolling 30-day average in both directions', () => {
  const source = [
    { ...matches[0], estimatedAverageViewers: 35 },
    { ...matches[1], estimatedAverageViewers: 120 },
    { ...matches[2], estimatedAverageViewers: 10 },
  ];
  assert.deepEqual(sortRaidMatches(source, 'average-high').map((m) => m.stream.user_id), ['oldest', 'middle', 'newest']);
  assert.deepEqual(sortRaidMatches(source, 'average-low').map((m) => m.stream.user_id), ['newest', 'middle', 'oldest']);
});

test('uses longest live as ending-soon proxy and newest start for just-started', () => {
  assert.deepEqual(sortRaidMatches(matches, 'ending-soon').map((m) => m.stream.user_id), ['oldest', 'middle', 'newest']);
  assert.deepEqual(sortRaidMatches(matches, 'just-started').map((m) => m.stream.user_id), ['newest', 'middle', 'oldest']);
});

test('does not mutate the original matches array and puts invalid dates last', () => {
  const source = [matches[0], match('unknown', 20, 99, ''), matches[2]];
  const before = [...source];
  const sorted = sortRaidMatches(source, 'just-started');
  assert.deepEqual(source, before);
  assert.equal(sorted.at(-1).stream.user_id, 'unknown');
});

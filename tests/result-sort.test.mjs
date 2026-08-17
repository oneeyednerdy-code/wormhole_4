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
    'recommended', 'viewers-high', 'viewers-low', 'ending-soon', 'just-started',
  ]);
});

test('sorts by recommendation and viewer count in both directions', () => {
  assert.deepEqual(sortRaidMatches(matches, 'recommended').map((m) => m.stream.user_id), ['middle', 'newest', 'oldest']);
  assert.deepEqual(sortRaidMatches(matches, 'viewers-high').map((m) => m.stream.user_id), ['oldest', 'middle', 'newest']);
  assert.deepEqual(sortRaidMatches(matches, 'viewers-low').map((m) => m.stream.user_id), ['newest', 'middle', 'oldest']);
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

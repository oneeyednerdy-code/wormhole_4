import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDiscoveryMode } from '../js/discovery-mode.js';
import { applyHardFilters } from '../js/raid-match.js';

const selectedCategories = [
  { id: 'extra-game', source: 'search' },
  { id: 'genre-game', source: 'genre' },
];

test('Following Only bypasses primary, extra, and genre game categories', () => {
  assert.deepEqual(resolveDiscoveryMode({
    onlyFollowing: true,
    primaryGameId: 'current-game',
    extraCategories: selectedCategories,
  }), {
    individualGameIds: [],
    genreGameIds: [],
    categoryMatchApplied: false,
    useFollowedStreamsEndpoint: true,
  });
});

test('ordinary discovery retains selected game categories', () => {
  assert.deepEqual(resolveDiscoveryMode({
    onlyFollowing: false,
    primaryGameId: 'current-game',
    extraCategories: selectedCategories,
  }), {
    individualGameIds: ['current-game', 'extra-game'],
    genreGameIds: ['genre-game'],
    categoryMatchApplied: true,
    useFollowedStreamsEndpoint: false,
  });
});

test('typed tags still filter followed streams after category bypass', () => {
  const streams = [
    { user_id: 'cozy', is_followed: true, tags: ['English', 'Cozy'] },
    { user_id: 'speedrun', is_followed: true, tags: ['English', 'Speedrun'] },
  ];
  assert.deepEqual(
    applyHardFilters(streams, { requireFollowed: true, requiredTags: ['Cozy'] })
      .map((stream) => stream.user_id),
    ['cozy']
  );
});

test('offline followed discovery requires language separately from a custom tag', () => {
  const streams = [
    { user_id: '1', tags: ['English', 'GenAIOptedOut'], is_followed: true },
    { user_id: '2', tags: ['English', 'Cozy'], is_followed: true },
    { user_id: '3', tags: ['Spanish', 'GenAIOptedOut'], is_followed: true },
  ];

  assert.deepEqual(
    applyHardFilters(streams, {
      requireFollowed: true,
      requiredTags: ['GenAIOptedOut'],
      requiredLanguageTag: 'English',
    }).map((stream) => stream.user_id),
    ['1']
  );
});

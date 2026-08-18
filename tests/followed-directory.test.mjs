import test from 'node:test';
import assert from 'node:assert/strict';

const { buildFollowedDirectoryMatches } = await import('../js/followed-directory.js');

test('followed directory keeps every live stream without applying match filters', () => {
  const streams = [
    { user_id: 'one', game_id: 'game-a', viewer_count: 3 },
    { user_id: 'two', game_id: 'game-b', viewer_count: 900 },
  ];
  const matches = buildFollowedDirectoryMatches(streams);

  assert.deepEqual(matches.map((match) => match.stream.user_id), ['one', 'two']);
  assert.equal(matches.every((match) => match.directoryListing), true);
  assert.equal(matches.every((match) => match.stream === streams.find((stream) => stream.user_id === match.stream.user_id)), true);
});

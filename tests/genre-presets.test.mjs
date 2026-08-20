import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GENRE_PRESETS,
  getGenreGameNames,
  getGenreLabelsForGame,
} from '../js/genre-presets.js';

test('genre presets expose gaming and creative Twitch category groups', () => {
  assert.deepEqual(
    GENRE_PRESETS.map((preset) => preset.id),
    ['rpg', 'mmo', 'shooter', 'strategy', 'horror', 'survival', 'simulation', 'adventure', 'creative', 'coding', 'conversation']
  );
});

test('genre game names are deduplicated across selected groups', () => {
  const names = getGenreGameNames(['rpg', 'mmo']);
  assert.equal(names.length, new Set(names).size);
  assert.ok(names.includes('Star Wars: The Old Republic'));
  assert.ok(names.includes('Baldur\'s Gate 3'));
});

test('resolved games retain their selected genre labels', () => {
  assert.deepEqual(getGenreLabelsForGame('Phasmophobia', ['horror', 'survival']), ['Horror']);
  assert.deepEqual(getGenreLabelsForGame('World of Warcraft', ['mmo']), ['MMO']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POPULAR_LANGUAGE_TAGS,
  applyLanguageTag,
  parseTagInput,
} from '../js/language-tags.js';

test('English is the default and popular language choices are unique', () => {
  assert.equal(POPULAR_LANGUAGE_TAGS[0], 'English');
  assert.ok(POPULAR_LANGUAGE_TAGS.includes('Spanish'));
  assert.ok(POPULAR_LANGUAGE_TAGS.includes('Japanese'));
  assert.equal(new Set(POPULAR_LANGUAGE_TAGS.map((tag) => tag.toLowerCase())).size, POPULAR_LANGUAGE_TAGS.length);
});

test('selecting a language replaces the previous language and preserves other tags', () => {
  assert.equal(applyLanguageTag('English, Cozy, speedrun', 'Spanish'), 'Cozy, speedrun, Spanish');
});

test('Any language removes language tags without removing custom Twitch tags', () => {
  assert.equal(applyLanguageTag('cozy, French, SPEEDRUN', ''), 'cozy, SPEEDRUN');
});

test('tag parsing removes blank and case-insensitive duplicate entries', () => {
  assert.deepEqual(parseTagInput('English, cozy, ENGLISH, , Cozy'), ['English', 'cozy']);
});

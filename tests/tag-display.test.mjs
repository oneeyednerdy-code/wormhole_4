import test from 'node:test';
import assert from 'node:assert/strict';

import { prepareTagDisplay } from '../js/tag-display.js';

test('result tag display includes all channel tags and marks shared tags', () => {
  const tags = prepareTagDisplay(
    ['English', 'Cozy', 'FirstPlaythrough'],
    ['english', 'Cozy'],
    ['cozy', 'FirstPlaythrough']
  );
  assert.deepEqual(tags, [
    { label: 'Cozy', shared: true, searched: true, language: false },
    { label: 'FirstPlaythrough', shared: false, searched: true, language: false },
    { label: 'English', shared: true, searched: false, language: true },
  ]);
});

test('result tag display removes empty and case-insensitive duplicates', () => {
  assert.deepEqual(prepareTagDisplay(['Cozy', ' cozy ', '', null]), [
    { label: 'Cozy', shared: false, searched: false, language: false },
  ]);
});

test('tag matching is case-insensitive and keeps neutral tags after matches', () => {
  assert.deepEqual(
    prepareTagDisplay(['Neutral', 'LGBTQIA+', 'Cozy'], ['cozy'], ['lgbtqia+']),
    [
      { label: 'LGBTQIA+', shared: false, searched: true, language: false },
      { label: 'Cozy', shared: true, searched: false, language: false },
      { label: 'Neutral', shared: false, searched: false, language: false },
    ]
  );
});

test('GenAIOptedOut receives searched-tag highlighting', () => {
  assert.deepEqual(
    prepareTagDisplay(['English', 'GenAIOptedOut'], [], ['GenAIOptedOut']),
    [
      { label: 'GenAIOptedOut', shared: false, searched: true, language: false },
      { label: 'English', shared: false, searched: false, language: true },
    ]
  );
});

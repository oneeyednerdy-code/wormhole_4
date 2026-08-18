import test from 'node:test';
import assert from 'node:assert/strict';

import { prepareTagDisplay } from '../js/tag-display.js';

test('result tag display includes all channel tags and marks shared tags', () => {
  const tags = prepareTagDisplay(
    ['English', 'Cozy', 'FirstPlaythrough'],
    ['english', 'Cozy']
  );
  assert.deepEqual(tags, [
    { label: 'English', shared: true, language: true },
    { label: 'Cozy', shared: true, language: false },
    { label: 'FirstPlaythrough', shared: false, language: false },
  ]);
});

test('result tag display removes empty and case-insensitive duplicates', () => {
  assert.deepEqual(prepareTagDisplay(['Cozy', ' cozy ', '', null]), [
    { label: 'Cozy', shared: false, language: false },
  ]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../js/search/filters.js', import.meta.url), 'utf8');

test('filters module imports viewer tolerance helpers used after modularization', () => {
  assert.match(source, /import\s*\{[^}]*describeViewerRange[^}]*parseViewerTolerance[^}]*\}\s*from\s*['"]\.\.\/viewer-tolerance\.js\?v=90['"]/s);
});

test('filters module owns labels it renders', () => {
  assert.match(source, /CONTENT_FILTER_LABELS/);
  assert.match(source, /const STATUS_LABELS/);
});


test('filters module imports all helpers used by interactive tag and genre controls', () => {
  assert.match(source, /import \{ normalizeTagKey \} from '\.\.\/tag-display\.js\?v=90';/);
  assert.match(source, /import \{ logger \} from '\.\.\/app\/logger\.js\?v=90';/);
  assert.match(source, /import \{ startLoading, finishLoading \} from '\.\.\/loading-state\.js\?v=90';/);
  assert.match(source, /function invalidateSearch\(\.\.\.args\) \{ return requireDeps\(\)\.invalidateSearch\(\.\.\.args\); \}/);
});

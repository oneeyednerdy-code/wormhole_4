import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIEWER_TOLERANCE_OPTIONS,
  calculateViewerRange,
  describeViewerRange,
  parseViewerTolerance,
} from '../js/viewer-tolerance.js';

test('supports 50, 75, 100 percent and unlimited audience ranges', () => {
  assert.deepEqual(VIEWER_TOLERANCE_OPTIONS, [50, 75, 100, null]);
  assert.equal(parseViewerTolerance('50'), 50);
  assert.equal(parseViewerTolerance('75'), 75);
  assert.equal(parseViewerTolerance('100'), 100);
  assert.equal(parseViewerTolerance('all'), null);
});

test('calculates each viewer range around the streamer audience', () => {
  assert.deepEqual(calculateViewerRange(40, 50), { min: 20, max: 60 });
  assert.deepEqual(calculateViewerRange(40, 75), { min: 10, max: 70 });
  assert.deepEqual(calculateViewerRange(40, 100), { min: 0, max: 80 });
  assert.equal(calculateViewerRange(40, null), null);
});

test('uses the safe 50 percent default for an invalid choice', () => {
  assert.equal(parseViewerTolerance('250'), 50);
  assert.deepEqual(calculateViewerRange(11, 'invalid'), { min: 5, max: 17 });
});

test('describes the viewer ranges clearly for a 13-viewer baseline', () => {
  assert.deepEqual(describeViewerRange(13, 50).range, { min: 6, max: 20 });
  assert.equal(describeViewerRange(13, 50).rangeText, '6 to 20 viewers');
  assert.equal(describeViewerRange(13, 75).rangeText, '3 to 23 viewers');
  assert.equal(describeViewerRange(13, 100).rangeText, '0 to 26 viewers');
  assert.match(describeViewerRange(13, 100).description, /zero to twice/);
});

test('describes unlimited audience matching without implying a range', () => {
  assert.deepEqual(describeViewerRange(13, 'all'), {
    name: 'Any audience size',
    rangeText: 'No viewer limit',
    description: 'No viewer-count restriction',
    chipText: 'Audience: Any size',
    range: null,
  });
});

test('explains when a viewer baseline is not available', () => {
  const presentation = describeViewerRange(undefined, 75);
  assert.equal(presentation.range, null);
  assert.equal(presentation.rangeText, '±75% when available');
  assert.equal(presentation.chipText, 'Audience: Wider · ±75%');
});

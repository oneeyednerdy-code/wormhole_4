import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VIEWER_TOLERANCE_OPTIONS,
  calculateViewerRange,
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateStreamEnd, parseTwitchDuration } from '../js/stream-end-estimate.js';

test('Twitch duration strings are converted to milliseconds', () => {
  assert.equal(parseTwitchDuration('3h12m9s'), 11_529_000);
  assert.equal(parseTwitchDuration('45m'), 2_700_000);
  assert.equal(parseTwitchDuration('bad'), null);
});

test('estimated end uses the median recent VOD duration', () => {
  const estimate = estimateStreamEnd('2026-08-17T12:00:00Z', [
    { duration: '2h' },
    { duration: '4h' },
    { duration: '3h' },
  ]);
  assert.equal(estimate.medianDurationMs, 3 * 60 * 60 * 1000);
  assert.equal(estimate.estimatedEndAt, '2026-08-17T15:00:00.000Z');
  assert.equal(estimate.sampleCount, 3);
});

test('even-sized histories average the two middle durations', () => {
  const estimate = estimateStreamEnd('2026-08-17T12:00:00Z', [
    { duration: '2h' },
    { duration: '4h' },
  ]);
  assert.equal(estimate.medianDurationMs, 3 * 60 * 60 * 1000);
});

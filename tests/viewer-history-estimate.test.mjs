import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateFromSamples } from '../js/viewer-history.js';

const NOW = Date.parse('2026-08-17T12:00:00Z');

test('historical estimates average sessions rather than oversampled moments', () => {
  const estimate = estimateFromSamples([
    { viewerCount: 10, sampledAt: '2026-08-17T10:00:00Z', streamStartedAt: 'a' },
    { viewerCount: 20, sampledAt: '2026-08-17T10:05:00Z', streamStartedAt: 'a' },
    { viewerCount: 45, sampledAt: '2026-08-17T11:00:00Z', streamStartedAt: 'b' },
  ], NOW);
  assert.equal(estimate.sessionCount, 2);
  assert.ok(estimate.average > 29 && estimate.average < 31);
});

test('history confidence increases with distinct stream sessions', () => {
  const samples = Array.from({ length: 15 }, (_, index) => ({
    viewerCount: 20 + index,
    sampledAt: new Date(NOW - index * 3_600_000).toISOString(),
    streamStartedAt: `session-${index % 5}`,
  }));
  assert.equal(estimateFromSamples(samples, NOW).confidence, 'Established history');
});

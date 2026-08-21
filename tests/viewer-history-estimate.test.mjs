import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateFromSamples, ViewerHistory } from '../js/viewer-history.js';

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

test('the rolling average ignores observations older than 30 days', () => {
  const estimate = estimateFromSamples([
    { viewerCount: 1_000, sampledAt: new Date(NOW - 31 * 86_400_000).toISOString(), streamStartedAt: 'old' },
    { viewerCount: 40, sampledAt: new Date(NOW - 20 * 86_400_000).toISOString(), streamStartedAt: 'recent-a' },
    { viewerCount: 60, sampledAt: new Date(NOW - 2 * 86_400_000).toISOString(), streamStartedAt: 'recent-b' },
  ], NOW);
  assert.equal(estimate.average, 50);
  assert.equal(estimate.sampleCount, 2);
  assert.equal(estimate.sessionCount, 2);
  assert.equal(estimate.windowDays, 30);
});

test('each observed stream session contributes equally to the 30-day average', () => {
  const estimate = estimateFromSamples([
    { viewerCount: 10, sampledAt: '2026-08-16T10:00:00Z', streamStartedAt: 'often-sampled' },
    { viewerCount: 20, sampledAt: '2026-08-16T10:05:00Z', streamStartedAt: 'often-sampled' },
    { viewerCount: 30, sampledAt: '2026-08-16T10:10:00Z', streamStartedAt: 'often-sampled' },
    { viewerCount: 60, sampledAt: '2026-08-17T10:00:00Z', streamStartedAt: 'once-sampled' },
  ], NOW);
  assert.equal(estimate.average, 40);
  assert.equal(estimate.sessionCount, 2);
});

test('viewer averages reuse one parsed history snapshot', () => {
  const samples = [{
    viewerCount: 25,
    sampledAt: new Date(NOW - 60_000).toISOString(),
    streamStartedAt: 'session-a',
  }];
  let reads = 0;
  globalThis.localStorage = {
    getItem(key) {
      reads += 1;
      if (key === 'wormhole_storage_choice_v1') return 'history';
      if (key === 'wormhole_viewer_history_v2') return JSON.stringify({ a: samples, b: samples });
      return null;
    },
    setItem() {},
    removeItem() {},
  };
  ViewerHistory.invalidateCache();
  const averages = ViewerHistory.getAverages(['a', 'b'], { now: NOW });
  ViewerHistory.getAverage('a', { now: NOW });
  assert.equal(averages.get('a').average, 25);
  assert.equal(reads, 3);
});

test('blocked or full storage never interrupts viewer-history recording', () => {
  globalThis.localStorage = {
    getItem(key) { return key === 'wormhole_storage_choice_v1' ? 'history' : null; },
    setItem() { throw new DOMException('Storage full', 'QuotaExceededError'); },
    removeItem() {},
  };
  ViewerHistory.invalidateCache();
  assert.doesNotThrow(() => ViewerHistory.recordSamples({
    channel: { viewerCount: 30, streamStartedAt: 'session-a' },
  }));
});

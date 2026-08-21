import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTwitchTrackerSummary, getTwitchTrackerSummary } from '../js/twitchtracker-summary.js';

test('normalizes TwitchTracker 30-day channel summary fields', () => {
  const result = normalizeTwitchTrackerSummary({
    rank: 42, minutes_streamed: 1200, avg_viewers: 37, max_viewers: 91,
    hours_watched: 740, followers: 12, followers_total: 900,
  }, 'OneEyedNerdy');
  assert.equal(result.channel, 'oneeyednerdy');
  assert.equal(result.averageViewers, 37);
  assert.equal(result.periodDays, 30);
});

test('requests the logged-in channel through the same-origin proxy', async () => {
  let requested;
  const result = await getTwitchTrackerSummary('OneEyedNerdy', {
    fetchImpl: async (url) => {
      requested = String(url);
      return { ok: true, json: async () => ({ avg_viewers: 22 }) };
    },
  });
  assert.match(requested, /\/api\/twitchtracker-summary\?channel=oneeyednerdy$/);
  assert.equal(result.averageViewers, 22);
});

test('caches repeated on-demand summaries for the same match channel', async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ avg_viewers: 31, max_viewers: 80 }) };
  };
  const first = await getTwitchTrackerSummary('Cache_Test_Channel', { fetchImpl });
  const second = await getTwitchTrackerSummary('cache_test_channel', { fetchImpl });
  assert.equal(first.averageViewers, 31);
  assert.equal(second.maxViewers, 80);
  assert.equal(calls, 1);
});

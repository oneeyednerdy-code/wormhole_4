import test from 'node:test';
import assert from 'node:assert/strict';

import { LoadingTracker } from '../js/loading-state.js';

test('loading tracker keeps overlapping work visible and shows the newest task', () => {
  const snapshots = [];
  let now = 1_000;
  const tracker = new LoadingTracker({
    onChange: (snapshot) => snapshots.push(snapshot),
    now: () => now,
    minimumVisibleMs: 0,
  });
  const first = tracker.begin('Loading Twitch profile...');
  const second = tracker.begin('Loading channel details...');
  tracker.finish(second);
  tracker.finish(first);

  assert.deepEqual(snapshots.map((snapshot) => snapshot.message), [
    'Loading Twitch profile...',
    'Loading channel details...',
    'Loading Twitch profile...',
    'Loading...',
  ]);
  assert.equal(snapshots.at(-1).active, false);
});

test('loading tracker keeps short tasks visible long enough to be understood', () => {
  let now = 2_000;
  let scheduled;
  const snapshots = [];
  const tracker = new LoadingTracker({
    onChange: (snapshot) => snapshots.push(snapshot),
    now: () => now,
    schedule: (callback, delay) => {
      scheduled = { callback, delay };
      return 1;
    },
    minimumVisibleMs: 450,
  });
  const task = tracker.begin('Checking Twitch...');
  now += 100;
  tracker.finish(task);

  assert.equal(scheduled.delay, 350);
  assert.equal(snapshots.at(-1).active, true);
  scheduled.callback();
  assert.equal(snapshots.at(-1).active, false);
});

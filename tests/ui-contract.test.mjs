import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/wormhole-app-v51.js', import.meta.url), 'utf8');

test('the interface exposes comparison, matching goal, presets, and layout controls', () => {
  for (const id of [
    'match-preset', 'save-filter-preset', 'load-filter-preset',
    'compare-shortlist-btn', 'compare-dialog', 'layout-override',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('dialogs and live status regions have accessible labels', () => {
  assert.match(html, /<dialog id="compare-dialog"[^>]*>/);
  assert.match(html, /id="results-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="eventsub-status"[^>]*title="Raid confirmation connection"/);
});

test('Twitch data failure exposes retry controls and stops confirmation startup', () => {
  assert.match(app, /Retry Twitch data/);
  assert.match(app, /Authorize again/);
  assert.match(app, /state\.eventSubStatus = 'data-error'/);
  assert.match(app, /else if \(!state\.myStream\)/);
});

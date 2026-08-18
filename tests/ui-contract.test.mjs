import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('v44 exposes comparison, matching goal, presets, and layout controls', () => {
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

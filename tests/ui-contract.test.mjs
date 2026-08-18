import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/wormhole-app-v58.js', import.meta.url), 'utf8');
const logo = await readFile(new URL('../assets/wormhole-logo.svg', import.meta.url), 'utf8');
const favicon = await readFile(new URL('../assets/favicon.ico', import.meta.url));

test('the login screen identifies the current release as a beta', () => {
  assert.match(html, /<p class="build-version">Beta-0\.0\.58<\/p>/);
});

test('branding uses the full page title, single-color logo, and ICO bookmark icon', () => {
  assert.match(html, /<title>Wormhole Networking Tool by OneEyedNerdy<\/title>/);
  assert.match(html, /<link rel="icon" href="assets\/favicon\.ico" sizes="any" \/>/);
  const colors = new Set([...logo.matchAll(/#[0-9a-f]{6}/gi)].map((match) => match[0].toUpperCase()));
  assert.deepEqual([...colors], ['#8B5CF6']);
  assert.deepEqual([...favicon.subarray(0, 4)], [0, 0, 1, 0]);
});

test('the interface exposes comparison, matching goal, presets, and layout controls', () => {
  for (const id of [
    'match-preset', 'save-filter-preset', 'load-filter-preset',
    'compare-shortlist-btn', 'compare-dialog', 'layout-override',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('the raid-goal selector explains its behavior and reruns visible matches', () => {
  assert.match(html, /id="match-preset"[^>]*aria-describedby="match-preset-hint"/);
  assert.match(html, /id="match-preset-hint"[^>]*aria-live="polite"/);
  for (const description of [
    'Prioritizes channels with viewer counts',
    'aiming near 150% of your current live audience',
    'Prioritizes channels you already follow',
    'Prioritizes channels you do not follow',
  ]) assert.match(app, new RegExp(description));
  assert.match(app, /el\.matchPreset\.addEventListener\('change',[\s\S]*?onFilterChanged\(\)/);
});

test('dialogs and live status regions have accessible labels', () => {
  assert.match(html, /<dialog id="compare-dialog"[^>]*>/);
  assert.match(html, /id="results-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="eventsub-status"[^>]*title="Raid confirmation connection"/);
});

test('the broadcaster panel switches between live and selected VOD embeds', () => {
  assert.match(app, /ownStreamMediaHtml\(\{ channel: state\.user\.login/);
  assert.match(app, /ownStreamMediaHtml\(\{ videoId: selectedVod\.id/);
  assert.match(app, /title="\$\{escapeHtml\(frameTitle\)\}"/);
  assert.match(app, /Playback is muted and does not start automatically/);
});

test('Twitch data failure exposes retry controls and stops confirmation startup', () => {
  assert.match(app, /Retry Twitch data/);
  assert.match(app, /Authorize again/);
  assert.match(app, /state\.eventSubStatus = 'data-error'/);
  assert.match(app, /else if \(!state\.myStream\)/);
});

test('match cards expose follow-back status without confusing unavailable data with no follow', () => {
  assert.match(app, /data-follows-you-id=/);
  assert.match(app, /Mutual follow/);
  assert.match(app, /Follows you/);
  assert.match(app, /Follow-back unavailable/);
});

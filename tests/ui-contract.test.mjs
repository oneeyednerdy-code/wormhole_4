import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/wormhole-app-v66.js', import.meta.url), 'utf8');
const logo = await readFile(new URL('../assets/wormhole-logo.svg', import.meta.url), 'utf8');
const favicon = await readFile(new URL('../assets/favicon.ico', import.meta.url));

test('the login screen identifies the current release as a beta', () => {
  assert.match(html, /<p class="build-version">Beta-0\.0\.66<\/p>/);
});

test('unfollowed result cards offer a safe Twitch follow action', () => {
  assert.match(app, /!s\.is_followed && twitchChannelUrl/);
  assert.match(app, />Follow on Twitch ↗<\/a>/);
  assert.match(app, /Opens Twitch where you can follow this channel/);
});

test('raid confirmation explains why target ad status cannot be verified', () => {
  assert.match(html, /id="raid-ad-status-note"/);
  assert.match(html, /Twitch only lets a broadcaster read their own ad schedule/);
  assert.match(html, /ads may differ between viewers/);
});

test('raid confirmation and countdown include live Twitch destination previews', () => {
  assert.match(html, /id="raid-confirm-preview"[^>]*title="Twitch raid destination preview"/);
  assert.match(html, /id="raid-progress-preview"[^>]*title="Twitch raid destination preview during countdown"/);
  assert.match(html, /Check the destination before Raid Now/);
  assert.match(app, /el\.raidConfirmPreview\.src = previewUrl \?\? 'about:blank'/);
  assert.match(app, /el\.raidProgressPreview\.src = previewUrl \?\? 'about:blank'/);
  assert.match(app, /el\.raidConfirmPreview\.src = 'about:blank'/);
});

test('following first is the default results order', () => {
  assert.match(html, /<option value="following-first" selected>Following First<\/option>/);
  assert.match(app, /resultsSort: 'following-first'/);
});

test('Following Only bypasses categories, keeps typed tags, and works offline', () => {
  assert.match(html, /Following Only ignores game categories/);
  assert.match(html, /Tags you type and other active filters still apply/);
  assert.match(app, /usingOfflineFollowingMode = !state\.myStream && wantsOnlyFollowing/);
  assert.match(app, /onlyFollowing: wantsOnlyFollowing/);
  assert.match(app, /requiredTags: tags/);
  assert.match(app, /requiredLanguageTag: languageTag/);
  assert.match(app, /const tags = getCustomTagsQuery\(\)/);
  assert.match(app, /buildFollowedDirectoryMatches\(filteredFollowedStreams\)/);
  assert.match(app, /el\.findBtn\.disabled = !el\.onlyFollowingFilter\.checked/);
});

test('branding uses the full page title, single-color logo, and ICO bookmark icon', () => {
  assert.match(html, /<title>Wormhole Networking Tool by OneEyedNerdy<\/title>/);
  assert.match(html, /<link rel="icon" href="assets\/favicon\.ico\?v=66" sizes="any" \/>/);
  const colors = new Set([...logo.matchAll(/#[0-9a-f]{6}/gi)].map((match) => match[0].toUpperCase()));
  assert.deepEqual([...colors], ['#8B5CF6']);
  assert.deepEqual([...favicon.subarray(0, 4)], [0, 0, 1, 0]);
});

test('result tags distinguish shared, searched, and combined matches accessibly', () => {
  assert.match(html, /id="tag-match-legend"[^>]*aria-label="Tag match legend"/);
  assert.match(app, /stream-tag--shared-searched/);
  assert.match(app, /stream-tag--searched/);
  assert.match(app, /shared with your stream and matches your tag search/);
  assert.match(app, /\['matches', 'followed-live'\]\.includes\(state\.resultsMode\)/);
  assert.match(app, /followedTagHighlightDebounce = setTimeout\(\(\) => renderResults\(\), 150\)/);
});

test('match cards enrich and display Twitch content classification labels', () => {
  assert.match(app, /getChannelInformationForUsers/);
  assert.match(app, /DebatedSocialIssuesAndPolitics: 'Politics and sensitive social issues'/);
  assert.match(app, /aria-label="Content warnings"/);
  assert.match(app, /contentLabelsHtml\(s\)/);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../js/wormhole-app-v73.js', import.meta.url), 'utf8');
const logo = await readFile(new URL('../assets/wormhole-logo.svg', import.meta.url), 'utf8');
const favicon = await readFile(new URL('../assets/favicon.ico', import.meta.url));

test('the login screen identifies the current release as a beta', () => {
  assert.match(html, /<p class="build-version">Beta-0\.0\.73<\/p>/);
});

test('small phones use a compact accessible account menu', () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /id="mobile-account-menu"/);
  assert.match(html, /aria-label="Open account and display menu"/);
  assert.equal((html.match(/data-logout/g) ?? []).length, 2);
  assert.match(app, /logoutBtns: document\.querySelectorAll\('\[data-logout\]'\)/);
  assert.match(app, /el\.logoutBtns\.forEach/);
});

test('the login page does not expose developer setup help', () => {
  assert.doesNotMatch(html, /Login setup help/);
  assert.doesNotMatch(html, /oauth-redirect-uri/);
  assert.doesNotMatch(html, /Confidential client type/);
  assert.match(app, /if \(el\.oauthRedirectUri\) el\.oauthRedirectUri\.textContent = redirectUri/);
});

test('privacy-safe diagnostics can be opened, copied, downloaded, and cleared', () => {
  for (const id of ['open-diagnostics', 'diagnostics-dialog', 'diagnostics-preview', 'diagnostics-download', 'diagnostics-copy', 'diagnostics-clear']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /new DiagnosticsLog/);
  assert.match(app, /wormhole-error-log-/);
  assert.match(app, /wormhole:storage-choice/);
  assert.match(app, /area: 'twitch-api'/);
  assert.match(html, /#bug-reports/);
  assert.match(html, /Download text log/);
});

test('following search reruns typed tags and results can sort by tag match', () => {
  assert.match(html, /<option value="tag-match">Tag Match<\/option>/);
  assert.match(app, /followedTagHighlightDebounce = setTimeout\(\(\) => runSearch\(\), 250\)/);
  assert.match(app, /getSearchedTagMatch/);
});

test('live stream view exposes past VODs and current-category control', () => {
  assert.match(html, /id="include-current-category" checked/);
  assert.match(app, /id="live-vod-select"/);
  assert.match(app, /el\.includeCurrentCategory\.checked \? state\.myStream\?\.game_id : ''/);
});

test('raid controls use manual copy and expose Twitch watch and dashboard links', () => {
  assert.match(html, /id="raid-message-copy"/);
  assert.match(html, /does not automatically post raid-completed messages/);
  assert.match(html, /id="raid-progress-watch-link"/);
  assert.match(html, /id="raid-destination-dashboard-link"/);
  assert.doesNotMatch(app, /sendChatMessage/);
});

test('the complete sponsorship page is linked from the footer', async () => {
  const sponsorship = await readFile(new URL('../sponsorship.html', import.meta.url), 'utf8');
  assert.match(html, /href="sponsorship\.html">Sponsorship<\/a>/);
  assert.match(sponsorship, /Sponsor Wormhole/);
  assert.match(sponsorship, /What is never sold/);
  assert.match(sponsorship, /Contact OneEyedNerdy/);
});

test('result cards use one Twitch channel link without a duplicate follow link', () => {
  assert.match(app, />Open on Twitch ↗<\/a>/);
  assert.doesNotMatch(app, /Follow on Twitch/);
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
  assert.match(html, /<link rel="icon" href="assets\/favicon\.ico\?v=73" sizes="any" \/>/);
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

test('content labels can be required or excluded during discovery', () => {
  assert.match(html, /id="content-label-filters"/);
  assert.match(html, /data-content-label="MatureAudience"/);
  assert.match(html, /data-content-label="DebatedSocialIssuesAndPolitics"/);
  assert.match(html, /<option value="include">Require<\/option>/);
  assert.match(html, /<option value="exclude">Exclude<\/option>/);
  assert.match(app, /filterStreamsByContentLabels/);
  assert.match(app, /content_labels_available/);
  assert.match(app, /contentLabels: getContentLabelFilter\(\)/);
});

test('suggested Twitch tags toggle into the tag search accessibly', () => {
  assert.match(html, /id="suggested-tags"/);
  for (const tag of ['GenAIOptedOut', 'AIOptedOut', 'MatureContent', '18Plus', 'LurkerFriendly', 'LGBTQIAPlus', 'Chatty', 'AMA']) {
    assert.match(html, new RegExp(`data-suggested-tag="${tag}"`));
  }
  assert.match(app, /renderSuggestedTags/);
  assert.match(app, /setAttribute\('aria-pressed'/);
});

test('chat access is displayed and restricted-chat channels can be excluded', () => {
  assert.match(html, /id="open-chat-only-filter" checked/);
  assert.match(html, /Exclude restricted chat/);
  assert.match(html, /followers-only, subscribers-only, or emote-only chat/);
  assert.match(app, /getChatSettingsForUsers/);
  assert.match(app, /requireOpenChat: wantsOpenChatOnly/);
  assert.match(app, /Followers-only chat/);
  assert.match(app, /Subscribers-only chat/);
  assert.match(app, /Chat modes unavailable/);
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

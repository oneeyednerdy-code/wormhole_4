import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const appMain = await readFile(new URL('../js/wormhole-app-v91.js', import.meta.url), 'utf8');
const resultsController = await readFile(new URL('../js/results/controller.js', import.meta.url), 'utf8');
const raidController = await readFile(new URL('../js/raid/controller.js', import.meta.url), 'utf8');
const searchController = await readFile(new URL('../js/search/controller.js', import.meta.url), 'utf8');
const filtersController = await readFile(new URL('../js/search/filters.js', import.meta.url), 'utf8');
const contentLabelsService = await readFile(new URL('../js/services/content-labels.js', import.meta.url), 'utf8');
const app = `${appMain}\n${resultsController}\n${raidController}\n${searchController}\n${filtersController}\n${contentLabelsService}`;
const appElements = await readFile(new URL('../js/app/elements.js', import.meta.url), 'utf8');
const appState = await readFile(new URL('../js/app/state.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../css/styles.css', import.meta.url), 'utf8');
const mobileStyles = await readFile(new URL('../css/mobile.css', import.meta.url), 'utf8');
const logo = await readFile(new URL('../assets/wormhole-logo.svg', import.meta.url), 'utf8');
const favicon = await readFile(new URL('../assets/favicon.ico', import.meta.url));
const headers = await readFile(new URL('../_headers', import.meta.url), 'utf8');
const accessSetup = await readFile(new URL('../CLOUDFLARE_ACCESS_SETUP.md', import.meta.url), 'utf8');

test('the login screen identifies the current release as an alpha', () => {
  assert.match(html, /<p class="build-version">[^<]*Alpha-0\.0\.91<\/p>/);
});

test('small phones use a compact accessible account menu', () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /id="mobile-account-menu"/);
  assert.match(html, /aria-label="Open account and display menu"/);
  assert.equal((html.match(/data-logout/g) ?? []).length, 2);
  assert.match(appElements, /logoutBtns: document\.querySelectorAll\('\[data-logout\]'\)/);
  assert.match(app, /el\.logoutBtns\.forEach/);
});

test('long Twitch work has an accessible non-blocking loading indicator', () => {
  assert.match(html, /id="global-loading"[^>]*role="status"/);
  assert.match(html, /id="global-loading-text"/);
  assert.match(styles, /\.global-loading__bar/);
  assert.match(styles, /\.global-loading__spinner/);
  assert.match(app, /startLoading\('Finding live Twitch channels\.\.\.'\)/);
  assert.match(app, /withLoading\('Checking your saved Twitch session\.\.\.'/);
});

test('result enrichment waits until cards approach the viewport', () => {
  assert.match(app, /new IntersectionObserver/);
  assert.match(app, /rootMargin: '500px 0px'/);
  assert.match(app, /ChannelHistory\.recordMany/);
  assert.match(styles, /content-visibility: auto/);
  assert.match(mobileStyles, /\.result-card \{[\s\S]*animation: none/);
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

test('results expose rolling 30-day viewer averages and sorting', () => {
  assert.match(html, /30-Day Average: High to Low/);
  assert.match(html, /30-Day Average: Low to High/);
  assert.match(html, /rolling 30-day average/);
  assert.match(app, /30-day observed average/);
  assert.match(app, /Similar 30-day average/);
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

test('discovery login uses least privilege and raid access is enabled separately', () => {
  assert.match(html, /Discovery uses read-only Twitch permissions/);
  assert.equal((html.match(/data-enable-raid-permission/g) ?? []).length, 2);
  assert.match(app, /includeRaidPermission: true/);
  assert.match(app, /raidPermissionEnabled/);
  assert.match(app, /Enable raid controls/);
});

test('maintained sessions validate hourly and raid actions perform a fresh security check', () => {
  assert.match(app, /TOKEN_VALIDATION_INTERVAL_MS = 60 \* 60 \* 1000/);
  assert.match(app, /startHourlyTokenValidation/);
  assert.match(app, /runHourlyTokenValidation/);
  assert.match(app, /validateRaidActionAuthorization/);
  assert.match(app, /raidActionInProgress/);
  assert.match(app, /currentBroadcasterStream, currentTargetStream/);
  assert.match(app, /String\(status\.validation\?\.user_id\) !== String\(state\.user\?\.id\)/);
});

test('Cloudflare headers protect the page and prevent stale HTML', () => {
  for (const policy of [
    "script-src 'self'",
    "frame-ancestors 'none'",
    'X-Content-Type-Options: nosniff',
    'X-Frame-Options: DENY',
    'Referrer-Policy: no-referrer',
    'Permissions-Policy:',
  ]) assert.match(headers, new RegExp(policy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(headers, /\/index\.html[\s\S]*?Cache-Control: no-store/);
  assert.match(headers, /\/version\.json[\s\S]*?Cache-Control: no-store/);
});

test('development preview protection has an owner-operated Cloudflare Access checklist', () => {
  assert.match(accessSetup, /Enable access policy/);
  assert.match(accessSetup, /default deny/);
  assert.match(accessSetup, /approved testers/);
  assert.match(accessSetup, /Twitch Developer Console/);
});

test('the Nerdspace Labs supporter page is linked from the footer and lists every tier', async () => {
  const sponsorship = await readFile(new URL('../sponsorship.html', import.meta.url), 'utf8');
  assert.match(html, /href="sponsorship\.html">Sponsorship<\/a>/);
  assert.match(sponsorship, /Support Nerdspace Labs/);
  assert.match(sponsorship, /Wormhole, NerdSync, and whatever I build next/);
  for (const tier of ['Launchpad Supporter', 'Orbital Scout', 'Lunar Navigator', 'Nebula Engineer', 'Supernova Patron']) {
    assert.match(sponsorship, new RegExp(tier));
  }
  for (const price of ['5', '10', '25', '50', '100']) {
    assert.match(sponsorship, new RegExp(`\\$${price} <span>per month<\\/span>`));
  }
  assert.match(sponsorship, /Included with every tier/);
  assert.match(sponsorship, /One-time support/);
  assert.match(sponsorship, /What support does not buy/);
  assert.match(sponsorship, /View supporter tiers on Ko-fi/);
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
  assert.match(appState, /resultsSort: 'following-first'/);
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
  assert.match(html, /<link rel="icon" href="assets\/favicon\.ico\?v=91" sizes="any" \/>/);
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

test('suggested Twitch tags visually match the game genre group controls', () => {
  assert.match(styles, /\.suggested-tags\s*{[\s\S]*?grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.suggested-tags button::before\s*{[\s\S]*?border-radius:\s*4px/);
  assert.match(styles, /\.suggested-tags button\[aria-pressed="true"\]::before\s*{[\s\S]*?background:\s*var\(--violet\)/);
  assert.match(mobileStyles, /html\[data-device-layout='mobile'\] \.genre-grid,[\s\S]*?html\[data-device-layout='mobile'\] \.suggested-tags\s*{[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
});

test('the interface uses consistent component and responsive spacing', () => {
  for (const token of ['--space-2: 8px', '--space-3: 12px', '--space-4: 16px', '--space-5: 20px', '--space-6: 24px']) {
    assert.match(styles, new RegExp(token));
  }
  assert.match(styles, /\.main\s*{[\s\S]*?gap:\s*var\(--space-6\)/);
  assert.match(styles, /\.panel\s*{[\s\S]*?padding:\s*var\(--space-6\)/);
  assert.match(styles, /\.filter-row--stack\s*{[\s\S]*?gap:\s*var\(--space-3\)/);
  assert.match(styles, /\.result-card\s*{[\s\S]*?padding:\s*var\(--space-5\)/);
  assert.match(styles, /\.dialog__actions\s*{[\s\S]*?margin-top:\s*var\(--space-5\)/);
  assert.match(mobileStyles, /html\[data-device-layout='mobile'\] \.main\s*{[\s\S]*?padding:\s*12px 10px/);
  assert.match(mobileStyles, /html\[data-device-layout='mobile'\] \.result-card\s*{[\s\S]*?padding:\s*16px 14px/);
  assert.match(mobileStyles, /html\[data-device-layout='mobile'\] \.dialog\s*{[\s\S]*?width:\s*calc\(100% - 16px\)/);
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

test('the interface exposes comparison, presets, and layout controls', () => {
  for (const id of [
    'save-filter-preset', 'load-filter-preset',
    'compare-shortlist-btn', 'compare-dialog', 'layout-override',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test('the former matching-goal selector and hidden scoring modes are removed', () => {
  assert.doesNotMatch(html, /id="match-preset"|id="match-preset-hint"|Matching goal/);
  assert.doesNotMatch(app, /matchPreset|MATCH_PRESET|goalMatchReason/);
});

test('viewer range choices show names, calculated ranges, and clear active chips', () => {
  for (const name of ['Similar audience', 'Wider audience', 'Broad audience', 'Any audience size']) {
    assert.match(html, new RegExp(name));
  }
  for (const value of ['50', '75', '100', 'all']) {
    assert.match(html, new RegExp(`data-viewer-range-value="${value}"`));
    assert.match(html, new RegExp(`data-viewer-range-description="${value}"`));
  }
  assert.match(app, /describeViewerRange\(baseline, value\)/);
  assert.match(app, /label: viewerPresentation\.chipText/);
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

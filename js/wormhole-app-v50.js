import { TWITCH_CONFIG } from './twitch-config-v50.js?v=50';
import { TwitchAuth } from './twitch-auth.js?v=50';
import { TwitchApi } from './twitch-api.js?v=50';
import { applyHardFilters, findRaidMatches } from './raid-match.js?v=50';
import { RaidListener } from './raid-listener.js?v=50';
import { ViewerHistory } from './viewer-history.js?v=50';
import { PreviousStreamHistory } from './previous-stream-history.js?v=50';
import { paginate } from './pagination.js?v=50';
import { sortRaidMatches } from './result-sort.js?v=50';
import { calculateViewerRange, parseViewerTolerance } from './viewer-tolerance.js?v=50';
import {
  createRaidCountdown,
  getRaidCountdownSnapshot,
} from './raid-countdown.js?v=50';
import { ChannelHistory } from './channel-history.js?v=50';
import { estimateStreamEnd, parseTwitchDuration } from './stream-end-estimate.js?v=50';
import {
  getGenreGameNames,
  getGenreLabelsForGame,
} from './genre-presets.js?v=50';
import { applyLanguageTag, isLanguageTag } from './language-tags.js?v=50';
import { prepareTagDisplay } from './tag-display.js?v=50';
import { normalizeTwitchLogin } from './direct-search.js?v=50';
import { buildFollowedDirectoryMatches } from './followed-directory.js?v=50';
import { loadFilterPreset, saveFilterPreset } from './filter-preset-storage.js?v=50';
import {
  buildRaidCompletionMessage,
  getRaidDestinationEmbedUrls,
  getTwitchRaidControlsUrl,
  isMatchingRaidConfirmation,
} from './raid-completion.js?v=50';

const state = {
  api: null,
  user: null,
  myStream: null,
  channelInfo: null,
  recentVods: [],
  selectedPreviousVodId: null,
  offlineCategorySelection: null,
  offlineCategoryCleared: false,
  usingPreviousStream: false,
  myTeams: [], // Twitch Teams the logged-in user belongs to
  matches: [],
  extraCategories: [], // additional {id, name} categories to include, beyond myStream's own game
  expandedWatchId: null, // user_id of the result card currently showing a live embed, if any
  expandedActivityId: null,
  raidListener: null,
  followStatusWarningShown: false,
  resultsPage: 1,
  resultsPageSize: 12,
  resultsSort: 'recommended',
  resultsMode: 'matches',
  activeRaid: null,
  raidCountdownTimer: null,
  raidCompletionInProgress: false,
  searchAbortController: null,
  eventSubStatus: 'disconnected',
  shortlistedIds: new Set(),
  hiddenResultIds: new Set(),
  resultsFetchedAt: null,
  searchCandidateCount: null,
  startupIssue: null,
  tokenValidation: null,
};

const el = {
  loginView: document.getElementById('login-view'),
  appView: document.getElementById('app-view'),
  loginBtn: document.getElementById('login-btn'),
  loginError: document.getElementById('login-error'),
  oauthRedirectUri: document.getElementById('oauth-redirect-uri'),
  logoutBtn: document.getElementById('logout-btn'),
  contrastToggle: document.getElementById('contrast-toggle'),
  eventSubStatus: document.getElementById('eventsub-status'),
  userName: document.getElementById('user-name'),
  userAvatar: document.getElementById('user-avatar'),
  streamPanel: document.getElementById('stream-panel'),
  filtersPanel: document.getElementById('filters-panel'),
  filtersContent: document.getElementById('filters-content'),
  filtersToggle: document.getElementById('filters-toggle'),
  activeFilterCount: document.getElementById('active-filter-count'),
  activeFilterChips: document.getElementById('active-filter-chips'),
  clearAllFilters: document.getElementById('clear-all-filters'),
  findBtn: document.getElementById('find-btn'),
  directStreamerForm: document.getElementById('direct-streamer-form'),
  directStreamerInput: document.getElementById('direct-streamer-input'),
  directStreamerBtn: document.getElementById('direct-streamer-btn'),
  directStreamerStatus: document.getElementById('direct-streamer-status'),
  showFollowedLiveBtn: document.getElementById('show-followed-live-btn'),
  followedLiveStatus: document.getElementById('followed-live-status'),
  viewerMatchHint: document.getElementById('viewer-match-hint'),
  viewerToleranceFilter: document.getElementById('viewer-tolerance-filter'),
  matchPreset: document.getElementById('match-preset'),
  saveFilterPreset: document.getElementById('save-filter-preset'),
  loadFilterPreset: document.getElementById('load-filter-preset'),
  statusFilters: document.getElementById('status-filters'),
  onlyFollowingFilter: document.getElementById('only-following-filter'),
  sameTeamFilter: document.getElementById('same-team-filter'),
  teamHint: document.getElementById('team-hint'),
  tagsInput: document.getElementById('tags-input'),
  languageSelect: document.getElementById('language-select'),
  matchStreamTags: document.getElementById('match-stream-tags'),
  matchStreamTagsHint: document.getElementById('match-stream-tags-hint'),
  genreFilters: document.getElementById('genre-filters'),
  addGenresBtn: document.getElementById('add-genres-btn'),
  clearGenresBtn: document.getElementById('clear-genres-btn'),
  genreHint: document.getElementById('genre-hint'),
  categorySearchInput: document.getElementById('category-search-input'),
  categorySuggestions: document.getElementById('category-suggestions'),
  selectedCategories: document.getElementById('selected-categories'),
  resultsPanel: document.getElementById('results-panel'),
  resultsList: document.getElementById('results-list'),
  resultsStatus: document.getElementById('results-status'),
  resultsPagination: document.getElementById('results-pagination'),
  resultsSort: document.getElementById('results-sort'),
  resultsPageSize: document.getElementById('results-page-size'),
  resultsPageSummary: document.getElementById('results-page-summary'),
  resultsPrevPage: document.getElementById('results-prev-page'),
  resultsNextPage: document.getElementById('results-next-page'),
  compareShortlistBtn: document.getElementById('compare-shortlist-btn'),
  compareDialog: document.getElementById('compare-dialog'),
  compareDialogContent: document.getElementById('compare-dialog-content'),
  compareDialogClose: document.getElementById('compare-dialog-close'),
  raidDialog: document.getElementById('raid-dialog'),
  raidDialogText: document.getElementById('raid-dialog-text'),
  raidMessageOptIn: document.getElementById('raid-message-opt-in'),
  raidMessagePreview: document.getElementById('raid-message-preview'),
  raidConfirmBtn: document.getElementById('raid-confirm-btn'),
  raidCancelBtn: document.getElementById('raid-cancel-btn'),
  raidProgressDialog: document.getElementById('raid-progress-dialog'),
  raidProgressAvatar: document.getElementById('raid-progress-avatar'),
  raidProgressTitle: document.getElementById('raid-progress-title'),
  raidProgressText: document.getElementById('raid-progress-text'),
  raidProgressAudience: document.getElementById('raid-progress-audience'),
  raidProgressRing: document.getElementById('raid-progress-ring'),
  raidCountdownValue: document.getElementById('raid-countdown-value'),
  raidProgressBar: document.getElementById('raid-progress-bar'),
  raidProgressCancelBtn: document.getElementById('raid-progress-cancel-btn'),
  raidControlsLink: document.getElementById('raid-controls-link'),
  discoveryView: document.getElementById('discovery-view'),
  raidDestinationView: document.getElementById('raid-destination-view'),
  raidDestinationTitle: document.getElementById('raid-destination-title'),
  raidDestinationStatus: document.getElementById('raid-destination-status'),
  raidDestinationPlayer: document.getElementById('raid-destination-player'),
  raidDestinationChat: document.getElementById('raid-destination-chat'),
  raidDestinationOpenLink: document.getElementById('raid-destination-open-link'),
  raidDestinationBackBtn: document.getElementById('raid-destination-back-btn'),
  toast: document.getElementById('toast'),
};

const STATUS_LABELS = {
  partner: 'Partner',
  affiliate: 'Affiliate',
  none: 'Non-affiliate',
};

const CONTENT_LABELS = {
  DrugsIntoxication: 'Drugs / intoxication',
  Gambling: 'Gambling',
  MatureGame: 'Mature-rated game',
  ProfanityVulgarity: 'Profanity',
  SexualThemes: 'Sexual themes',
  ViolentGraphic: 'Graphic violence',
};

function fmtNumber(n) {
  return new Intl.NumberFormat().format(Math.round(n));
}

function fmtDuration(ms) {
  const totalMinutes = Math.floor(ms / 1000 / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtDate(value, options = { dateStyle: 'medium' }) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : new Intl.DateTimeFormat(undefined, options).format(date);
}

function showToast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.classList.toggle('toast--error', isError);
  el.toast.classList.add('toast--visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.toast.classList.remove('toast--visible'), 3500);
}

function showView(view) {
  el.loginView.classList.toggle('hidden', view !== 'login');
  el.appView.classList.toggle('hidden', view !== 'app');
}

// ---- Login flow -----------------------------------------------------

el.loginBtn.addEventListener('click', () => {
  if (TWITCH_CONFIG.clientId === 'YOUR_TWITCH_CLIENT_ID') {
    el.loginError.textContent =
      'Set your Twitch Client ID in js/twitch-config-v50.js before logging in.';
    return;
  }
  try {
    TwitchAuth.redirectToLogin();
  } catch (error) {
    console.error(error);
    el.loginError.textContent = error instanceof Error
      ? error.message
      : 'Could not start Twitch login. Check that browser storage is enabled and try again.';
  }
});

el.logoutBtn.addEventListener('click', async () => {
  searchGeneration += 1;
  clearActiveRaid();
  await TwitchAuth.logout();
  state.raidListener?.stop();
  state.raidListener = null;
  state.api = null;
  state.user = null;
  state.myStream = null;
  state.matches = [];
  state.startupIssue = null;
  state.tokenValidation = null;
  el.showFollowedLiveBtn.disabled = true;
  showView('login');
});

async function loadCurrentUser(validation) {
  const startupWarnings = [];
  state.startupIssue = null;
  try {
    state.user = await state.api.getCurrentUser();
  } catch (error) {
    const fallbackUser = TwitchAuth.userFromValidation(validation);
    if (!fallbackUser) throw error;
    state.user = fallbackUser;
    state.startupIssue = createStartupIssue('Profile', error);
    startupWarnings.push('Twitch authorized the account, but its full profile is temporarily unavailable. Wormhole opened with the validated account identity.');
    console.error('Full Twitch profile unavailable; using validated identity:', error);
  }
  const [streamResult, teamsResult, channelResult, vodResult] = await Promise.allSettled([
    state.api.getLiveStreamForUser(state.user.id),
    state.api.getChannelTeams(state.user.id),
    state.api.getChannelInformation(state.user.id),
    state.api.getRecentArchives(state.user.id, { maxResults: 5 }),
  ]);
  state.myStream = streamResult.status === 'fulfilled' ? streamResult.value : null;
  state.myTeams = teamsResult.status === 'fulfilled' ? teamsResult.value : [];
  state.channelInfo = channelResult.status === 'fulfilled' ? channelResult.value : null;
  state.recentVods = vodResult.status === 'fulfilled' ? vodResult.value : [];
  if (streamResult.status === 'rejected') {
    state.startupIssue ??= createStartupIssue('Live status', streamResult.reason);
    startupWarnings.push('Live status could not be loaded. Offline discovery remains available; refresh live status after Twitch recovers.');
    console.error('Live status unavailable during startup:', streamResult.reason);
  }
  state.selectedPreviousVodId = state.recentVods[0]?.id ?? null;
  state.usingPreviousStream = false;
  el.showFollowedLiveBtn.disabled = false;
  el.followedLiveStatus.textContent = 'Ready to load every followed channel currently live.';
  if (state.myStream) PreviousStreamHistory.record(state.myStream);
  renderUser();
  renderStreamPanel();
  renderViewerMatchHint();
  renderTeamHint();
  renderActiveFilters();
  state.raidListener?.stop();
  state.raidListener = null;
  if (state.startupIssue) {
    state.eventSubStatus = 'data-error';
    renderEventSubStatus();
  } else if (!state.myStream) {
    state.eventSubStatus = 'standby';
    renderEventSubStatus();
  } else {
    try {
      startRaidListener();
    } catch (error) {
      state.eventSubStatus = 'error';
      renderEventSubStatus();
      startupWarnings.push('Raid confirmation could not connect. Discovery still works, but confirmed-raid messaging is unavailable.');
      console.error('Raid confirmation listener could not start:', error);
    }
  }
  showView('app');
  if (startupWarnings.length) showToast(startupWarnings[0], true);
}

function createStartupIssue(area, error) {
  const status = Number(error?.status) || null;
  const statusText = status ? `Twitch API ${status}` : 'Network or browser error';
  return {
    area,
    status,
    title: `${area} data unavailable`,
    message: `${statusText}. Wormhole stopped raid confirmation until Twitch data loads successfully.`,
    detail: String(error?.message || 'The Twitch request failed.'),
  };
}

function startRaidListener() {
  state.raidListener?.stop();
  state.raidListener = new RaidListener(state.api, state.user.id, {
    onRaidSent: (event) => {
      handleRaidCompleted(event);
    },
    onStatusChange: (status) => {
      state.eventSubStatus = status;
      renderEventSubStatus();
    },
  });
  state.raidListener.start();
}

function renderEventSubStatus() {
  if (!el.eventSubStatus) return;
  const labels = {
    connected: 'Confirmation connected',
    connecting: 'Confirmation connecting',
    reconnecting: 'Confirmation reconnecting',
    standby: 'Confirmation standby',
    'data-error': 'Twitch data unavailable',
    disconnected: 'Confirmation offline',
    error: 'Confirmation unavailable',
  };
  el.eventSubStatus.dataset.status = state.eventSubStatus;
  el.eventSubStatus.textContent = labels[state.eventSubStatus] ?? labels.disconnected;
  el.raidMessageOptIn.disabled = state.eventSubStatus !== 'connected';
  if (el.raidMessageOptIn.disabled) el.raidMessageOptIn.checked = false;
}

async function init() {
  try {
    el.oauthRedirectUri.textContent = TWITCH_CONFIG.redirectUri;
  } catch (error) {
    el.loginError.textContent = error instanceof Error ? error.message : 'This address cannot be used for Twitch login.';
    showView('login');
    return;
  }
  let capturedToken;
  try {
    capturedToken = TwitchAuth.captureRedirectToken();
  } catch (error) {
    el.loginError.textContent = error.message;
    showView('login');
    return;
  }
  const token = capturedToken ?? TwitchAuth.getSavedToken();

  if (!token) {
    showView('login');
    return;
  }

  const tokenStatus = await TwitchAuth.validateToken(token);
  if (!tokenStatus.valid && tokenStatus.reason !== 'unavailable') {
    await TwitchAuth.logout();
    el.loginError.textContent = tokenStatus.reason === 'missing_scopes'
      ? `Twitch permissions changed. Log in again and approve every requested permission${tokenStatus.missingScopes?.length ? ` (${tokenStatus.missingScopes.join(', ')})` : ''}.`
      : tokenStatus.reason === 'wrong_client'
        ? 'This login token belongs to a different Twitch application. Log in again.'
        : 'Your Twitch login expired. Please log in again.';
    showView('login');
    return;
  }
  if (!tokenStatus.valid) {
    el.loginError.textContent = 'Twitch could not be reached to verify your login. Your session was kept; check your connection and refresh.';
    showView('login');
    return;
  }

  state.api = new TwitchApi(token);
  state.tokenValidation = tokenStatus.validation;
  try {
    await loadCurrentUser(tokenStatus.validation);
  } catch (e) {
    console.error(e);
    const status = Number(e?.status);
    el.loginError.textContent = status === 401
      ? 'Twitch accepted the login callback but rejected the API session (401). Log in again and approve every permission.'
      : status === 403
        ? 'Twitch authenticated you but blocked profile access (403). Check the application Client ID and permissions.'
        : status === 429
          ? 'Twitch is rate-limiting profile requests. Wait a minute, then refresh; you do not need to authorize again.'
          : `Could not finish loading Wormhole after Twitch login${status ? ` (API ${status})` : ''}. Refresh once; if it continues, check the browser console for the exact startup error.`;
    showView('login');
  }
}

// ---- Rendering: user + own stream ------------------------------------

function renderUser() {
  el.userName.textContent = state.user.display_name;
  el.userAvatar.src = state.user.profile_image_url || '';
  el.userAvatar.alt = state.user.display_name;
}

async function refreshLiveStatus() {
  try {
    state.myStream = await state.api.getLiveStreamForUser(state.user.id);
    state.startupIssue = null;
    state.usingPreviousStream = false;
    if (state.myStream) PreviousStreamHistory.record(state.myStream);
    renderStreamPanel();
    if (state.myStream && !state.raidListener) startRaidListener();
    if (!state.myStream) {
      state.raidListener?.stop();
      state.raidListener = null;
      state.eventSubStatus = 'standby';
      renderEventSubStatus();
    }
  } catch (error) {
    console.error(error);
    state.startupIssue = createStartupIssue('Live status', error);
    state.raidListener?.stop();
    state.raidListener = null;
    state.eventSubStatus = 'data-error';
    renderEventSubStatus();
    renderStreamPanel();
  }
}

function renderStreamPanel() {
  const s = state.myStream;
  renderTagMatchHint();
  if (state.startupIssue) {
    const issue = state.startupIssue;
    el.streamPanel.innerHTML = `
      <div class="twitch-data-error" role="alert">
        <p class="section-eyebrow">Twitch data connection</p>
        <h2>${escapeHtml(issue.title)}</h2>
        <p>${escapeHtml(issue.message)}</p>
        <details>
          <summary>Technical details</summary>
          <code>${escapeHtml(issue.detail)}</code>
        </details>
        <div class="twitch-data-error__actions">
          <button id="retry-twitch-data-btn" class="btn btn--primary" type="button">Retry Twitch data</button>
          <button id="reauthorize-twitch-btn" class="btn btn--ghost" type="button">Authorize again</button>
        </div>
      </div>`;
    document.getElementById('retry-twitch-data-btn')?.addEventListener('click', async (event) => {
      event.currentTarget.disabled = true;
      event.currentTarget.textContent = 'Retrying…';
      await loadCurrentUser(state.tokenValidation);
    });
    document.getElementById('reauthorize-twitch-btn')?.addEventListener('click', async () => {
      await TwitchAuth.logout();
      TwitchAuth.redirectToLogin();
    });
    return;
  }
  if (!s) {
    const selectedVod = getSelectedPreviousVod();
    const defaults = getPreviousStreamDefaults(selectedVod);
    state.offlineCategorySelection = defaults.category;
    state.offlineCategoryCleared = defaults.categoryCleared;
    const vodOptions = state.recentVods
      .slice(0, 5)
      .map((vod) => `<option value="${escapeHtml(vod.id)}"${vod.id === state.selectedPreviousVodId ? ' selected' : ''}>${escapeHtml(formatPreviousVodLabel(vod))}</option>`)
      .join('');
    el.streamPanel.innerHTML = `
      <div class="offline-card">
        <div class="offline-card__dot"></div>
        <p class="offline-card__title">You're not live right now.</p>
        <div class="offline-reference">
          <p class="offline-reference__eyebrow">Previous stream</p>
          ${state.recentVods.length ? `
            <label class="offline-reference__field-label" for="offline-vod-select">Choose one of your latest streams</label>
            <select id="offline-vod-select" class="text-input offline-reference__select">${vodOptions}</select>` : `
            <p class="offline-card__hint">No published Twitch VODs were found. You can still create a reference manually.</p>`}

          <label class="offline-reference__field-label" for="offline-category-input">Category for that stream</label>
          <div class="category-search offline-reference__category-search">
            <input
              id="offline-category-input"
              class="text-input"
              type="text"
              value="${escapeHtml(defaults.category?.name ?? '')}"
              placeholder="Search for the stream category"
              autocomplete="off"
            />
            <ul id="offline-category-suggestions" class="category-suggestions hidden"></ul>
          </div>
          <button class="btn btn--ghost btn--small offline-reference__clear-category" id="clear-offline-category-btn" type="button">Clear category · compare tags across Twitch</button>
          <p id="offline-category-hint" class="offline-card__hint">${escapeHtml(defaults.categoryHint)}</p>

          <label class="offline-reference__field-label" for="offline-viewers-input">Average viewers for that stream</label>
          <input
            id="offline-viewers-input"
            class="text-input offline-reference__viewer-input"
            type="number"
            min="0"
            step="1"
            value="${defaults.viewerBaseline ?? ''}"
            placeholder="Enter an average"
          />
          <p class="offline-card__hint">${escapeHtml(defaults.viewerHint)}</p>
          <button class="btn btn--primary" id="use-previous-stream-btn">Find using selected stream</button>
        </div>
        <button class="btn btn--ghost offline-card__refresh" id="refresh-stream-btn">Refresh live status</button>
      </div>`;
    document.getElementById('refresh-stream-btn').addEventListener('click', refreshLiveStatus);
    document.getElementById('offline-vod-select')?.addEventListener('change', (event) => {
      state.selectedPreviousVodId = event.target.value;
      renderStreamPanel();
    });
    setupOfflineCategorySearch();
    document.getElementById('use-previous-stream-btn').addEventListener('click', () => {
      const input = document.getElementById('offline-viewers-input');
      const viewerCount = Number(input.value);
      if (!Number.isFinite(viewerCount) || viewerCount < 0 || input.value.trim() === '') {
        showToast('Enter the average viewers from your previous stream.', true);
        input.focus();
        return;
      }
      if (!state.offlineCategorySelection?.id && !state.offlineCategoryCleared) {
        showToast('Choose a category, or clear it to compare tags across Twitch.', true);
        document.getElementById('offline-category-input').focus();
        return;
      }
      const selectedVod = getSelectedPreviousVod();
      if (selectedVod?.stream_id) {
        PreviousStreamHistory.saveReference({
          streamId: selectedVod.stream_id,
          userId: state.user.id,
          title: selectedVod.title,
          gameId: state.offlineCategorySelection?.id,
          gameName: state.offlineCategorySelection?.name,
          startedAt: selectedVod.created_at,
          viewerBaseline: viewerCount,
          categoryCleared: state.offlineCategoryCleared,
        });
      }
      state.myStream = buildPreviousStreamReference(
        viewerCount,
        selectedVod,
        state.offlineCategorySelection
      );
      state.usingPreviousStream = true;
      renderStreamPanel();
      showToast('Using your previous stream as the match baseline.');
      runSearch();
    });
    el.findBtn.disabled = true;
    el.directStreamerBtn.disabled = true;
    el.directStreamerStatus.textContent = 'Go live or choose a previous stream before using direct lookup.';
    renderViewerMatchHint();
    renderSelectedCategories();
    return;
  }

  el.findBtn.disabled = false;
  el.directStreamerBtn.disabled = false;
  if (!el.directStreamerStatus.dataset.result) {
    el.directStreamerStatus.textContent = 'Ready to look up an exact live Twitch channel.';
  }
  const historical = state.usingPreviousStream;
  el.streamPanel.innerHTML = `
    <div class="tally">
      <span class="tally__light"></span>
      <span class="tally__label">${historical ? 'PREVIOUS STREAM' : 'ON AIR'}</span>
    </div>
    <h2 class="stream-title">${escapeHtml(s.title)}</h2>
    <p class="stream-game">${escapeHtml(s.game_name || 'All categories · tags-first search')}</p>
    <div class="stat-row">
      <span class="stat-chip"><span class="stat-chip__mono">${fmtNumber(s.viewer_count)}</span> ${historical ? 'viewer baseline' : 'viewers'}</span>
      <span class="stat-chip"><span class="stat-chip__mono">${fmtDuration(Date.now() - new Date(s.started_at).getTime())}</span> ${historical ? 'previous duration' : 'live'}</span>
    </div>
    ${historical ? '<button class="btn btn--ghost historical-refresh" id="refresh-historical-btn">Check live status</button>' : ''}`;
  document.getElementById('refresh-historical-btn')?.addEventListener('click', refreshLiveStatus);
  renderSelectedCategories();
  renderViewerMatchHint();
}

function renderViewerMatchHint() {
  const tolerance = getViewerTolerancePercent();
  if (!state.myStream) {
    el.viewerMatchHint.textContent = tolerance === null
      ? 'Viewer-count matching is currently unlimited.'
      : `Go live or choose a previous stream to calculate a ±${tolerance}% viewer range.`;
    return;
  }
  const viewers = state.myStream.viewer_count;
  const range = calculateViewerRange(viewers, tolerance);
  const source = state.usingPreviousStream ? 'previous-stream baseline' : `your ${fmtNumber(viewers)}`;
  el.viewerMatchHint.textContent = tolerance === null
    ? 'Showing channels regardless of viewer count.'
    : `Active range: ${fmtNumber(range.min)}–${fmtNumber(range.max)} viewers (±${tolerance}% of ${source}).`;
}

function formatPreviousVodLabel(vod) {
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(vod.created_at)
  );
  return `${date} — ${vod.title || 'Untitled stream'} (${vod.duration || 'duration unknown'})`;
}

function getSelectedPreviousVod() {
  return state.recentVods.find((vod) => vod.id === state.selectedPreviousVodId)
    ?? state.recentVods[0]
    ?? null;
}

function getPreviousStreamDefaults(vod) {
  const saved = vod?.stream_id ? PreviousStreamHistory.getByStreamId(vod.stream_id) : null;
  const generalAverage = ViewerHistory.getAverage(state.user.id);
  const isLatestVod = !vod || vod.id === state.recentVods[0]?.id;
  const categoryCleared = saved?.categorySource === 'cleared';
  const category = categoryCleared
    ? null
    : saved?.gameId
    ? { id: saved.gameId, name: saved.gameName, source: 'saved' }
    : isLatestVod && state.channelInfo?.game_id
      ? { id: state.channelInfo.game_id, name: state.channelInfo.game_name, source: 'last-played' }
      : null;

  return {
    category,
    categoryCleared,
    categoryHint: categoryCleared
      ? 'Category filtering is off for this stream. Results will be compared across Twitch using tags and your other filters.'
      : saved?.gameId
      ? saved.categorySource === 'observed'
        ? 'Category restored from this stream’s locally observed Wormhole data.'
        : 'Category restored from your saved correction for this VOD.'
      : category
        ? 'Twitch does not include a category on each VOD. Confirm or change the last-played category shown above.'
        : 'Twitch does not provide the category for this older VOD. Search and select its category above.',
    viewerBaseline: saved?.averageViewers != null
      ? Math.round(saved.averageViewers)
      : generalAverage
        ? Math.round(generalAverage.average)
        : '',
    viewerHint: saved?.averageViewers != null
      ? saved.baselineSource === 'manual'
        ? 'Using the viewer baseline you previously saved for this VOD.'
        : `Calculated from ${saved.sampleCount} sample${saved.sampleCount === 1 ? '' : 's'} saved for this stream.`
      : generalAverage
        ? `Using your broader Wormhole average from ${generalAverage.sampleCount} saved sample${generalAverage.sampleCount === 1 ? '' : 's'}; edit it if this stream differed.`
        : 'Twitch does not expose past concurrent viewers, so enter the stream’s average.',
  };
}

let offlineCategorySearchDebounce = null;

function setupOfflineCategorySearch() {
  const input = document.getElementById('offline-category-input');
  const suggestions = document.getElementById('offline-category-suggestions');
  const hint = document.getElementById('offline-category-hint');
  const clearButton = document.getElementById('clear-offline-category-btn');
  if (!input || !suggestions) return;

  const hideSuggestions = () => suggestions.classList.add('hidden');
  const chooseCategory = (category) => {
    state.offlineCategorySelection = category;
    state.offlineCategoryCleared = false;
    input.value = category.name;
    hint.textContent = `Using ${category.name} for this previous stream.`;
    hideSuggestions();
  };

  input.addEventListener('input', () => {
    clearTimeout(offlineCategorySearchDebounce);
    state.offlineCategorySelection = null;
    state.offlineCategoryCleared = false;
    hint.textContent = 'Select a Twitch category from the suggestions.';
    const query = input.value.trim();
    if (!query) {
      hideSuggestions();
      return;
    }
    offlineCategorySearchDebounce = setTimeout(async () => {
      try {
        const results = await state.api.searchCategories(query, { maxResults: 20 });
        if (input.value.trim() !== query) return;
        if (!results.length) {
          suggestions.innerHTML = '<li class="category-suggestions__empty">No matches</li>';
        } else {
          suggestions.innerHTML = results.map((category) => `
            <li class="category-suggestions__item" tabindex="0" data-id="${escapeHtml(category.id)}" data-name="${escapeHtml(category.name)}">
              ${escapeHtml(category.name)}
            </li>`).join('');
          suggestions.querySelectorAll('[data-id]').forEach((item) => {
            const selectItem = () => chooseCategory({ id: item.dataset.id, name: item.dataset.name });
            item.addEventListener('mousedown', (event) => {
              event.preventDefault();
              selectItem();
            });
            item.addEventListener('keydown', (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                selectItem();
              }
            });
          });
        }
        suggestions.classList.remove('hidden');
      } catch (error) {
        console.error(error);
        hideSuggestions();
      }
    }, 300);
  });
  clearButton?.addEventListener('click', () => {
    clearTimeout(offlineCategorySearchDebounce);
    state.offlineCategorySelection = null;
    state.offlineCategoryCleared = true;
    input.value = '';
    hint.textContent = 'Category filtering is off. Wormhole will compare tags across live Twitch channels.';
    hideSuggestions();
  });
  input.addEventListener('blur', () => setTimeout(hideSuggestions, 150));
}

function buildPreviousStreamReference(viewerCount, vod, category) {
  const saved = vod?.stream_id ? PreviousStreamHistory.getByStreamId(vod.stream_id) : null;
  const vodDuration = parseTwitchDuration(vod?.duration);
  const sampledDuration = saved?.startedAt && saved?.lastSeenAt
    ? new Date(saved.lastSeenAt).getTime() - new Date(saved.startedAt).getTime()
    : null;
  const durationMs = vodDuration || (sampledDuration > 0 ? sampledDuration : 4 * 60 * 60 * 1000);

  return {
    user_id: state.user.id,
    user_login: state.user.login,
    user_name: state.user.display_name,
    game_id: category?.id ?? '',
    game_name: category?.name ?? '',
    title: vod?.title || saved?.title || state.channelInfo?.title || 'Previous stream',
    viewer_count: viewerCount,
    started_at: new Date(Date.now() - durationMs).toISOString(),
    tags: saved?.tags ?? [],
    isHistoricalReference: true,
  };
}

function renderTeamHint() {
  if (!state.myTeams.length) {
    el.teamHint.textContent = "You're not on a Twitch team, so this filter has nothing to match against.";
    el.sameTeamFilter.disabled = true;
    el.sameTeamFilter.checked = false;
  } else {
    const names = state.myTeams.map((t) => t.team_display_name || t.team_name).join(', ');
    el.teamHint.textContent = `You're on: ${names}`;
    el.sameTeamFilter.disabled = false;
  }
}

// ---- Raid match search -------------------------------------------------

el.findBtn.addEventListener('click', () => runSearch());

let directSearchGeneration = 0;
let followedLiveGeneration = 0;

el.directStreamerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  followedLiveGeneration += 1;
  if (!state.myStream || !state.api) {
    el.directStreamerStatus.textContent = 'Go live or choose a previous stream first.';
    return;
  }

  const login = normalizeTwitchLogin(el.directStreamerInput.value);
  if (!login) {
    el.directStreamerStatus.textContent = 'Enter a valid Twitch username or channel URL.';
    el.directStreamerInput.focus();
    return;
  }

  const generation = ++directSearchGeneration;
  state.shortlistedIds.clear();
  state.hiddenResultIds.clear();
  state.matches = [];
  el.resultsPanel.classList.add('hidden');
  el.directStreamerBtn.disabled = true;
  el.directStreamerBtn.textContent = 'Looking up…';
  el.directStreamerStatus.dataset.result = 'true';
  el.directStreamerStatus.textContent = `Looking up ${login}…`;

  try {
    const profile = await state.api.getUserByLogin(login);
    if (generation !== directSearchGeneration) return;
    if (!profile) {
      state.matches = [];
      el.resultsPanel.classList.add('hidden');
      el.directStreamerStatus.textContent = `No Twitch channel named ${login} was found.`;
      return;
    }
    if (profile.id === state.user.id) {
      state.matches = [];
      el.resultsPanel.classList.add('hidden');
      el.directStreamerStatus.textContent = `${profile.display_name} is your own channel.`;
      return;
    }

    const stream = await state.api.getLiveStreamForUser(profile.id);
    if (generation !== directSearchGeneration) return;
    if (!stream) {
      state.matches = [];
      el.resultsPanel.classList.add('hidden');
      el.directStreamerStatus.textContent = `${profile.display_name} is currently offline.`;
      return;
    }

    stream.broadcaster_type = profile.broadcaster_type || 'none';
    try {
      const followedIds = await state.api.getFollowedBroadcasterIds(state.user.id);
      if (generation !== directSearchGeneration) return;
      stream.is_followed = followedIds.has(profile.id);
      stream.followed_at = stream.is_followed ? state.api.getFollowedAt(profile.id) : null;
    } catch (error) {
      console.error(error);
      stream.is_followed = false;
    }

    state.matches = findRaidMatches(state.myStream, [stream], {
      ignoreViewerTolerance: true,
      compareTags: el.matchStreamTags.checked,
      categoryMatchApplied: Boolean(
        state.myStream.game_id && state.myStream.game_id === stream.game_id
      ),
    });
    state.hiddenResultIds.clear();
    state.resultsFetchedAt = Date.now();
    state.searchCandidateCount = null;
    state.resultsPage = 1;
    state.resultsSort = 'recommended';
    state.resultsMode = 'direct';
    el.directStreamerStatus.textContent = `Showing ${profile.display_name}. Discovery filters were bypassed.`;
    el.resultsPanel.classList.remove('hidden');
    renderResults();
  } catch (error) {
    if (generation !== directSearchGeneration) return;
    console.error(error);
    el.directStreamerStatus.textContent = 'Wormhole could not look up that streamer. Try again.';
  } finally {
    if (generation === directSearchGeneration && state.myStream) {
      el.directStreamerBtn.disabled = false;
      el.directStreamerBtn.textContent = 'Find streamer';
    }
  }
});

el.showFollowedLiveBtn.addEventListener('click', async () => {
  if (!state.api || !state.user) return;

  const generation = ++followedLiveGeneration;
  state.shortlistedIds.clear();
  state.hiddenResultIds.clear();
  searchGeneration += 1;
  directSearchGeneration += 1;
  if (state.myStream) {
    el.directStreamerBtn.disabled = false;
    el.directStreamerBtn.textContent = 'Find streamer';
  }

  el.showFollowedLiveBtn.disabled = true;
  el.showFollowedLiveBtn.textContent = 'Loading followed channels…';
  el.followedLiveStatus.textContent = 'Loading every followed channel currently live…';
  el.resultsPanel.classList.remove('hidden');
  el.resultsPagination.classList.add('hidden');
  el.resultsList.innerHTML = loadingCardsHtml();
  showSearchStatus('Loading your live followed channels from Twitch…');

  try {
    const streams = await state.api.getFollowedLiveStreams(state.user.id);
    if (generation !== followedLiveGeneration) return;

    const broadcasterTypes = await state.api.getBroadcasterTypes(
      streams.map((stream) => stream.user_id)
    );
    if (generation !== followedLiveGeneration) return;

    for (const stream of streams) {
      stream.broadcaster_type = broadcasterTypes.get(stream.user_id) ?? 'none';
      stream.is_followed = true;
      stream.followed_at = null;
    }

    state.matches = buildFollowedDirectoryMatches(streams);
    state.hiddenResultIds.clear();
    state.resultsFetchedAt = Date.now();
    state.searchCandidateCount = null;
    state.resultsPage = 1;
    state.resultsSort = 'viewers-high';
    state.resultsMode = 'followed-live';
    state.expandedWatchId = null;
    state.expandedActivityId = null;
    el.followedLiveStatus.textContent = streams.length
      ? `${fmtNumber(streams.length)} followed channel${streams.length === 1 ? '' : 's'} live now. Discovery filters were bypassed.`
      : 'None of the channels you follow are currently live.';
    renderResults();
  } catch (error) {
    if (generation !== followedLiveGeneration) return;
    console.error(error);
    state.matches = [];
    state.resultsMode = 'followed-live';
    el.resultsList.innerHTML = '';
    el.followedLiveStatus.textContent = 'Could not load followed live channels.';
    showResultNotice({
      title: 'Followed channels unavailable',
      message: 'Wormhole could not load your live followed channels. Log out and back in if Twitch needs the follow permission.',
      retry: false,
    });
  } finally {
    if (generation === followedLiveGeneration && state.api) {
      el.showFollowedLiveBtn.disabled = false;
      el.showFollowedLiveBtn.textContent = 'Show all live followed channels';
    }
  }
});

// Re-run the search automatically when a filter changes, but only if
// results are already showing — no point searching before the first click.
function rerunIfResultsVisible() {
  if (
    !el.resultsPanel.classList.contains('hidden') &&
    state.resultsMode === 'matches'
  ) runSearch();
}

function onFilterChanged() {
  renderActiveFilters();
  rerunIfResultsVisible();
}

el.viewerToleranceFilter.addEventListener('change', () => {
  renderViewerMatchHint();
  onFilterChanged();
});
el.statusFilters.addEventListener('change', onFilterChanged);
el.onlyFollowingFilter.addEventListener('change', onFilterChanged);
el.sameTeamFilter.addEventListener('change', onFilterChanged);
el.tagsInput.addEventListener('input', renderActiveFilters);
el.tagsInput.addEventListener('change', rerunIfResultsVisible);
el.matchStreamTags.addEventListener('change', onFilterChanged);
el.languageSelect.addEventListener('change', () => {
  el.tagsInput.value = applyLanguageTag(el.tagsInput.value, el.languageSelect.value);
  onFilterChanged();
});

// Partner/Affiliate are additive toggles on top of the always-included
// non-affiliate majority — unchecking both doesn't hide anyone, it just
// stops adding partners/affiliates on top of everyone else. This avoids
// the confusing old behavior where unchecking everything showed nothing.
function getSelectedStatuses() {
  const checked = [...el.statusFilters.querySelectorAll('input[type="checkbox"]')]
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
  return [...new Set([...checked, 'none'])];
}

function getTagsQuery() {
  return el.tagsInput.value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function getMeaningfulMyTags() {
  return (state.myStream?.tags ?? []).filter((tag) => !isLanguageTag(tag));
}

function renderTagMatchHint() {
  if (!state.myStream) {
    el.matchStreamTagsHint.textContent = 'Go live or select a saved previous stream to compare its Twitch tags.';
    return;
  }
  const tags = getMeaningfulMyTags();
  if (!tags.length) {
    el.matchStreamTagsHint.textContent = state.usingPreviousStream
      ? 'No saved non-language tags are available for this previous stream.'
      : 'Your live stream has no non-language tags to score yet; language is handled separately.';
    return;
  }
  el.matchStreamTagsHint.textContent = `${state.usingPreviousStream ? 'Saved' : 'Live'} tags used for recommendations: ${tags.join(', ')}.`;
}

function getSelectedGenreIds() {
  return [...el.genreFilters.querySelectorAll('input[type="checkbox"]:checked')]
    .map((checkbox) => checkbox.value);
}

function getViewerTolerancePercent() {
  const selected = el.viewerToleranceFilter.querySelector('input:checked')?.value ?? '50';
  return parseViewerTolerance(selected);
}

function renderActiveFilters() {
  const filters = [];
  const viewerTolerance = getViewerTolerancePercent();
  if (el.matchPreset.value !== 'similar') {
    filters.push({
      key: 'match-preset',
      label: el.matchPreset.options[el.matchPreset.selectedIndex].text,
    });
  }
  if (viewerTolerance !== null) {
    filters.push({ key: 'viewer-range', label: `Audience ±${viewerTolerance}%` });
  }
  el.statusFilters.querySelectorAll('input[type="checkbox"]:not(:checked)').forEach((checkbox) => {
    filters.push({ key: `status:${checkbox.value}`, label: `Hide ${STATUS_LABELS[checkbox.value]}` });
  });
  if (el.sameTeamFilter.checked && !el.sameTeamFilter.disabled) {
    filters.push({ key: 'same-team', label: 'Shared team' });
  }
  if (el.onlyFollowingFilter.checked) {
    filters.push({ key: 'only-following', label: 'Following only' });
  }
  if (el.matchStreamTags.checked) {
    filters.push({ key: 'my-tags', label: 'Match my tags' });
  }
  for (const tag of getTagsQuery()) {
    filters.push({ key: `tag:${tag}`, label: `#${tag}` });
  }
  for (const genre of getSelectedGenreIds()) {
    filters.push({
      key: `genre:${genre}`,
      label: genre.toUpperCase(),
    });
  }
  state.extraCategories
    .filter((category) => category.source !== 'genre')
    .forEach((category) => {
      filters.push({ key: `category:${category.id}`, label: category.name });
    });

  el.activeFilterCount.textContent = `${filters.length} active filter${filters.length === 1 ? '' : 's'}`;
  el.clearAllFilters.hidden = filters.length === 0;
  const emptyFilterMessage = state.myStream?.game_id
    ? 'No extra restrictions — your current category is always included.'
    : 'No category restriction — searching across Twitch with your tag and audience settings.';
  el.activeFilterChips.innerHTML = filters.length
    ? filters.map((filter) => `
        <button class="active-filter-chip" type="button" data-clear-filter="${escapeHtml(filter.key)}" aria-label="Remove ${escapeHtml(filter.label)} filter">
          ${escapeHtml(filter.label)} <span aria-hidden="true">×</span>
        </button>`).join('')
    : `<span class="active-filters__empty">${escapeHtml(emptyFilterMessage)}</span>`;

  el.activeFilterChips.querySelectorAll('[data-clear-filter]').forEach((button) => {
    button.addEventListener('click', () => clearFilter(button.dataset.clearFilter));
  });
}

function clearFilter(key) {
  if (key === 'viewer-range') {
    const allViewers = el.viewerToleranceFilter.querySelector('input[value="all"]');
    if (allViewers) allViewers.checked = true;
    renderViewerMatchHint();
  } else if (key === 'match-preset') {
    el.matchPreset.value = 'similar';
  } else if (key === 'same-team') {
    el.sameTeamFilter.checked = false;
  } else if (key === 'only-following') {
    el.onlyFollowingFilter.checked = false;
  } else if (key === 'my-tags') {
    el.matchStreamTags.checked = false;
  } else if (key.startsWith('status:')) {
    const value = key.slice('status:'.length);
    const checkbox = [...el.statusFilters.querySelectorAll('input')]
      .find((input) => input.value === value);
    if (checkbox) checkbox.checked = true;
  } else if (key.startsWith('tag:')) {
    const removedTag = key.slice('tag:'.length).toLowerCase();
    el.tagsInput.value = getTagsQuery()
      .filter((tag) => tag.toLowerCase() !== removedTag)
      .join(', ');
    if (el.languageSelect.value.toLowerCase() === removedTag) {
      el.languageSelect.value = '';
    }
  } else if (key.startsWith('genre:')) {
    const value = key.slice('genre:'.length);
    const checkbox = [...el.genreFilters.querySelectorAll('input')]
      .find((input) => input.value === value);
    if (checkbox) checkbox.checked = false;
    applyGenreSelection();
    renderActiveFilters();
    return;
  } else if (key.startsWith('category:')) {
    removeCategory(key.slice('category:'.length));
    return;
  }
  renderActiveFilters();
  rerunIfResultsVisible();
}

el.clearAllFilters.addEventListener('click', () => {
  genreApplyGeneration += 1;
  clearTimeout(genreApplyDebounce);
  const allViewers = el.viewerToleranceFilter.querySelector('input[value="all"]');
  if (allViewers) allViewers.checked = true;
  el.statusFilters.querySelectorAll('input').forEach((input) => { input.checked = true; });
  el.onlyFollowingFilter.checked = false;
  el.sameTeamFilter.checked = false;
  el.matchStreamTags.checked = false;
  el.matchPreset.value = 'similar';
  el.languageSelect.value = '';
  el.tagsInput.value = '';
  el.genreFilters.querySelectorAll('input').forEach((input) => { input.checked = false; });
  state.extraCategories = [];
  el.genreHint.textContent = 'Choose one or more genre groups; selections apply automatically.';
  renderViewerMatchHint();
  renderSelectedCategories();
  rerunIfResultsVisible();
});

let genreApplyDebounce = null;
let genreApplyGeneration = 0;

async function applyGenreSelection({ showEmptyError = false } = {}) {
  const generation = ++genreApplyGeneration;
  const genreIds = getSelectedGenreIds();
  if (!genreIds.length) {
    const hadGenreCategories = state.extraCategories.some(
      (category) => category.source === 'genre'
    );
    state.extraCategories = state.extraCategories.filter(
      (category) => category.source !== 'genre'
    );
    el.addGenresBtn.disabled = false;
    renderSelectedCategories();
    el.genreHint.textContent = 'Choose one or more genre groups; selections apply automatically.';
    if (showEmptyError) showToast('Choose at least one genre group first.', true);
    if (hadGenreCategories) rerunIfResultsVisible();
    return;
  }

  const names = getGenreGameNames(genreIds);
  el.addGenresBtn.disabled = true;
  el.genreHint.textContent = 'Resolving genre games against Twitch categories…';
  try {
    const { games, unresolved } = await state.api.resolveGenreCategories(names);
    if (generation !== genreApplyGeneration) return;

    state.extraCategories = state.extraCategories.filter((category) => {
      if (category.source !== 'genre') return true;
      const labels = getGenreLabelsForGame(category.name, genreIds);
      category.genreLabels = labels;
      return labels.length > 0;
    });

    for (const game of games) {
      if (game.id === state.myStream?.game_id) continue;
      const labels = getGenreLabelsForGame(game.name, genreIds);
      const existing = state.extraCategories.find((category) => category.id === game.id);
      if (existing) {
        if (existing.source === 'genre') {
          existing.genreLabels = [...new Set([...(existing.genreLabels ?? []), ...labels])];
        }
        continue;
      }
      state.extraCategories.push({
        id: game.id,
        name: game.name,
        source: 'genre',
        genreLabels: labels,
      });
    }
    renderSelectedCategories();
    const totalGenreCategories = state.extraCategories.filter(
      (category) => category.source === 'genre'
    ).length;
    el.genreHint.textContent = `${totalGenreCategories} genre ${totalGenreCategories === 1 ? 'category' : 'categories'} selected${unresolved.length ? `; ${unresolved.length} unavailable names were skipped` : ''}. Remove individual games below if needed.`;
    rerunIfResultsVisible();
  } catch (error) {
    if (generation !== genreApplyGeneration) return;
    console.error(error);
    el.genreHint.textContent = 'Could not resolve genre categories. Please try again.';
    showToast('Could not add genre categories.', true);
  } finally {
    if (generation === genreApplyGeneration) el.addGenresBtn.disabled = false;
  }
}

el.addGenresBtn.addEventListener('click', () => applyGenreSelection({ showEmptyError: true }));

el.genreFilters.addEventListener('change', () => {
  clearTimeout(genreApplyDebounce);
  const selected = getSelectedGenreIds();
  el.genreHint.textContent = selected.length
    ? 'Applying selected genre groups…'
    : 'Clearing genre categories…';
  genreApplyDebounce = setTimeout(() => applyGenreSelection(), 250);
  renderActiveFilters();
});

el.clearGenresBtn.addEventListener('click', () => {
  genreApplyGeneration += 1;
  clearTimeout(genreApplyDebounce);
  state.extraCategories = state.extraCategories.filter(
    (category) => category.source !== 'genre'
  );
  el.genreFilters.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = false;
  });
  el.genreHint.textContent = 'Genre categories cleared. Exact categories remain selected.';
  el.addGenresBtn.disabled = false;
  renderSelectedCategories();
  rerunIfResultsVisible();
});

// ---- Category search (Twitch's category database, IGDB-backed) --------
//
// IGDB's own API can't be called from a browser: it has no CORS support
// and its auth needs a client secret that can't safely live in front-end
// code. Twitch's /games and /search/categories endpoints cover the same
// underlying database (Twitch owns IGDB) and work with the token we already
// have. Using both prevents exact categories from being buried by fuzzy ones.

let categorySearchDebounce = null;
let categorySearchGeneration = 0;

el.categorySearchInput.addEventListener('input', () => {
  clearTimeout(categorySearchDebounce);
  const query = el.categorySearchInput.value;
  if (!query.trim()) {
    hideCategorySuggestions();
    return;
  }
  categorySearchDebounce = setTimeout(() => runCategorySearch(query), 300);
});

el.categorySearchInput.addEventListener('blur', () => {
  // Let a click on a suggestion register before we hide the list.
  setTimeout(hideCategorySuggestions, 150);
});

async function runCategorySearch(query) {
  const generation = ++categorySearchGeneration;
  const normalizedQuery = query.trim();
  try {
    const results = await state.api.searchCategories(normalizedQuery, { maxResults: 20 });
    if (
      generation !== categorySearchGeneration ||
      el.categorySearchInput.value.trim() !== normalizedQuery
    ) return;
    renderCategorySuggestions(results);
  } catch (e) {
    if (generation !== categorySearchGeneration) return;
    console.error(e);
    hideCategorySuggestions();
  }
}

function renderCategorySuggestions(results) {
  const alreadyAdded = new Set([
    state.myStream?.game_id,
    ...state.extraCategories.map((c) => c.id),
  ]);
  const filtered = results.filter((g) => !alreadyAdded.has(g.id));

  if (!filtered.length) {
    el.categorySuggestions.innerHTML =
      '<li class="category-suggestions__empty">No other matches</li>';
  } else {
    el.categorySuggestions.innerHTML = filtered
      .map(
        (g) => `
        <li class="category-suggestions__item" tabindex="0" data-id="${escapeHtml(g.id)}" data-name="${escapeHtml(g.name)}">
          <img class="category-suggestions__art" src="${escapeHtml(g.box_art_url?.replace('{width}', '52').replace('{height}', '72') ?? '')}" alt="" />
          ${escapeHtml(g.name)}
        </li>`
      )
      .join('');

    el.categorySuggestions.querySelectorAll('.category-suggestions__item[data-id]').forEach((item) => {
      const selectItem = () => {
        addCategory({ id: item.dataset.id, name: item.dataset.name });
        el.categorySearchInput.value = '';
        hideCategorySuggestions();
      };
      item.addEventListener('mousedown', (event) => {
        event.preventDefault();
        selectItem();
      });
      item.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          selectItem();
        }
      });
    });
  }

  el.categorySuggestions.classList.remove('hidden');
}

function hideCategorySuggestions() {
  el.categorySuggestions.classList.add('hidden');
}

function addCategory(category) {
  if (state.extraCategories.some((c) => c.id === category.id)) return;
  state.extraCategories.push({ ...category, source: category.source ?? 'manual' });
  renderSelectedCategories();
  rerunIfResultsVisible();
}

function removeCategory(id) {
  state.extraCategories = state.extraCategories.filter((c) => c.id !== id);
  renderSelectedCategories();
  rerunIfResultsVisible();
}

function renderSelectedCategories() {
  const primary = state.myStream?.game_id
    ? `<span class="category-chip category-chip--locked" title="Your current category is always included">${escapeHtml(state.myStream.game_name)}</span>`
    : state.myStream
      ? '<span class="category-chip category-chip--all" title="No primary category filter">All categories · tags-first</span>'
      : '';

  const extra = state.extraCategories
    .map(
      (c) => `
      <span class="category-chip${c.source === 'genre' ? ' category-chip--genre' : ''}"${c.source === 'genre' ? ` title="Genre group: ${escapeHtml((c.genreLabels ?? []).join(', '))}"` : ''}>
        ${escapeHtml(c.name)}
        <button type="button" class="category-chip__remove" data-remove-id="${escapeHtml(c.id)}" aria-label="Remove ${escapeHtml(c.name)}">×</button>
      </span>`
    )
    .join('');

  el.selectedCategories.innerHTML = primary + extra;

  el.selectedCategories.querySelectorAll('[data-remove-id]').forEach((btn) => {
    btn.addEventListener('click', () => removeCategory(btn.dataset.removeId));
  });
  renderActiveFilters();
}

let searchGeneration = 0;
let resultsRenderGeneration = 0;

function loadingCardsHtml(count = 6) {
  return Array.from({ length: count }, () => `
    <li class="result-card result-card--skeleton" aria-hidden="true">
      <div class="skeleton skeleton--heading"></div>
      <div class="skeleton skeleton--media"></div>
      <div class="skeleton skeleton--line"></div>
      <div class="skeleton skeleton--line skeleton--short"></div>
    </li>`).join('');
}

function showSearchStatus(message) {
  el.resultsStatus.innerHTML = `
    <div class="search-state search-state--loading">
      <span class="search-state__spinner" aria-hidden="true"></span>
      <div><strong>Searching Twitch</strong><p>${escapeHtml(message)}</p></div>
    </div>`;
  el.resultsStatus.classList.remove('hidden');
}

function showResultNotice({ title, message, retry = false }) {
  el.resultsStatus.innerHTML = `
    <div class="search-state">
      <span class="search-state__icon" aria-hidden="true">◎</span>
      <div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>
      ${retry ? '<button class="btn btn--ghost" type="button" data-retry-search>Try again</button>' : ''}
    </div>`;
  el.resultsStatus.classList.remove('hidden');
  el.resultsStatus.querySelector('[data-retry-search]')?.addEventListener('click', () => runSearch());
}

async function runSearch() {
  if (!state.myStream) return;
  state.shortlistedIds.clear();
  state.hiddenResultIds.clear();
  state.searchAbortController?.abort();
  state.searchAbortController = new AbortController();
  const searchSignal = state.searchAbortController.signal;
  followedLiveGeneration += 1;
  state.resultsMode = 'matches';
  if (!state.usingPreviousStream) PreviousStreamHistory.record(state.myStream);

  const generation = ++searchGeneration;

  const selectedStatuses = getSelectedStatuses();
  const wantsOnlyFollowing = el.onlyFollowingFilter.checked;
  const wantsSameTeam = el.sameTeamFilter.checked && !el.sameTeamFilter.disabled;
  const viewerTolerancePercent = getViewerTolerancePercent();
  const showAllViewerCounts = viewerTolerancePercent === null;
  const tags = getTagsQuery();

  el.findBtn.disabled = true;
  el.findBtn.textContent = 'Finding matches…';

  el.resultsPanel.classList.remove('hidden');
  el.resultsPagination.classList.add('hidden');
  el.resultsList.innerHTML = loadingCardsHtml();
  const hasPrimaryCategory = Boolean(state.myStream.game_id);
  showSearchStatus(hasPrimaryCategory || state.extraCategories.length
    ? 'Scanning your selected categories…'
    : 'Scanning live channels across Twitch for tag matches…');

  try {
    const individualGameIds = [
      state.myStream.game_id,
      ...state.extraCategories
        .filter((category) => category.source !== 'genre')
        .map((category) => category.id),
    ].filter(Boolean);
    const genreGameIds = state.extraCategories
      .filter((category) => category.source === 'genre')
      .map((category) => category.id);

    const viewerRange = calculateViewerRange(state.myStream.viewer_count, viewerTolerancePercent);
    const minimumMatchedViewers = viewerRange?.min ?? null;
    const categoryMatchApplied = individualGameIds.length > 0 || genreGameIds.length > 0;
    const usingFollowedStreamsEndpoint = wantsOnlyFollowing && !categoryMatchApplied;
    const candidateRequests = [];

    if (usingFollowedStreamsEndpoint) {
      showSearchStatus('Loading every channel you follow that is currently live…');
      candidateRequests.push(state.api.getFollowedLiveStreams(state.user.id, { signal: searchSignal }));
    } else {
      candidateRequests.push(...individualGameIds.map(
        (id) => state.api.getLiveStreamsByGame(id, {
          maxResults: showAllViewerCounts ? 500 : 1000,
          stopBelowViewers: minimumMatchedViewers,
          signal: searchSignal,
        })
      ));
      if (genreGameIds.length) {
        candidateRequests.push(state.api.getLiveStreamsByGames(genreGameIds, {
          maxResults: showAllViewerCounts ? 500 : 1000,
          stopBelowViewers: minimumMatchedViewers,
          signal: searchSignal,
        }));
      }
      if (!categoryMatchApplied) {
        candidateRequests.push(state.api.getLiveStreams({
          maxResults: showAllViewerCounts ? 500 : 1000,
          stopBelowViewers: minimumMatchedViewers,
          signal: searchSignal,
        }));
      }
    }
    const candidateLists = await Promise.all(candidateRequests);
    if (generation !== searchGeneration) return;

    const seen = new Set();
    const candidates = [];
    const addCandidates = (list) => {
      for (const s of list) {
        if (seen.has(s.user_id)) continue;
        seen.add(s.user_id);
        candidates.push(s);
      }
    };
    addCandidates(candidateLists.flat());
    state.searchCandidateCount = candidates.length;

    const candidatesToEnrich = applyHardFilters(candidates, {
      minViewers: showAllViewerCounts ? null : viewerRange.min,
      maxViewers: showAllViewerCounts ? null : viewerRange.max,
      requiredTags: tags,
    });

    showSearchStatus(`Comparing ${candidatesToEnrich.length} compatible live channel${candidatesToEnrich.length === 1 ? '' : 's'}…`);

    // broadcaster_type isn't on /streams — look it up in one batched call
    // and attach it to each candidate before filtering/scoring.
    const broadcasterTypes = await state.api.getBroadcasterTypes(
      candidatesToEnrich.map((s) => s.user_id),
      { signal: searchSignal }
    );
    if (generation !== searchGeneration) return;
    for (const s of candidatesToEnrich) {
      s.broadcaster_type = broadcasterTypes.get(s.user_id) ?? 'none';
    }

    // Follow status annotates results and powers the optional following-only
    // filter. When that filter is active, a failed lookup must stop the search
    // instead of presenting an incorrect empty result set.
    showSearchStatus('Checking channels you already follow…');
    try {
      const followedIds = usingFollowedStreamsEndpoint
        ? new Set(candidates.map((stream) => stream.user_id))
        : await state.api.getFollowedBroadcasterIds(state.user.id, { signal: searchSignal });
      if (generation !== searchGeneration) return;
      for (const s of candidatesToEnrich) {
        s.is_followed = followedIds.has(s.user_id);
        s.followed_at = s.is_followed ? state.api.getFollowedAt(s.user_id) : null;
      }
    } catch (e) {
      console.error(e);
      for (const s of candidatesToEnrich) s.is_followed = false;
      if (wantsOnlyFollowing) {
        el.resultsList.innerHTML = '';
        state.matches = [];
        showResultNotice({
          title: 'Follow list unavailable',
          message: 'Wormhole could not load the channels you follow. Log out and back in if Twitch needs the follow permission.',
          retry: true,
        });
        return;
      }
      if (!state.followStatusWarningShown) {
        showToast(
          'Follow status is unavailable. Log out and back in if Twitch needs the follow permission.',
          true
        );
        state.followStatusWarningShown = true;
      }
    }

    // Team membership has no batch endpoint (one request per channel), so
    // only fetch it for candidates that already survive the cheap filters
    // — narrowing the list first keeps this from firing 100 requests when
    // most of them would've been filtered out anyway.
    if (wantsSameTeam) {
      showSearchStatus('Checking shared Twitch teams…');

      const preFiltered = applyHardFilters(candidatesToEnrich, {
        allowedBroadcasterTypes: selectedStatuses,
        requireFollowed: wantsOnlyFollowing,
        requiredTags: tags,
      });

      const myTeamIds = new Set(state.myTeams.map((t) => t.id));
      const memberships = await state.api.getTeamMembershipsForUsers(
        preFiltered.map((s) => s.user_id),
        { signal: searchSignal }
      );
      if (generation !== searchGeneration) return;

      for (const s of preFiltered) {
        const teams = memberships.get(s.user_id) ?? [];
        s.shared_team_names = teams
          .filter((t) => myTeamIds.has(t.id))
          .map((t) => t.team_display_name || t.team_name);
      }
    }

    state.matches = findRaidMatches(state.myStream, candidatesToEnrich, {
      viewerTolerancePercent: viewerTolerancePercent ?? 50,
      ignoreViewerTolerance: showAllViewerCounts,
      allowedBroadcasterTypes: selectedStatuses,
      requireFollowed: wantsOnlyFollowing,
      requireSharedTeam: wantsSameTeam,
      requiredTags: tags,
      compareTags: el.matchStreamTags.checked,
      categoryMatchApplied,
      primaryCategoryId: state.myStream.game_id,
      matchPreset: el.matchPreset.value,
    });
    state.resultsFetchedAt = Date.now();
    state.resultsPage = 1;
    renderResults();
  } catch (e) {
    if (generation !== searchGeneration) return;
    if (e?.name === 'AbortError') return;
    console.error(e);
    el.resultsList.innerHTML = '';
    showResultNotice({
      title: 'The search hit turbulence',
      message: 'Wormhole could not fetch raid matches. Check your connection and try again.',
      retry: true,
    });
  } finally {
    if (generation === searchGeneration && state.myStream) {
      el.findBtn.disabled = false;
      el.findBtn.textContent = 'Find someone to raid';
    }
  }
}

function scoreClass(score) {
  if (score >= 80) return 'score--high';
  if (score >= 55) return 'score--mid';
  return 'score--low';
}

function scoreLabel(score) {
  if (score >= 80) return 'Excellent match';
  if (score >= 55) return 'Good match';
  return 'Possible match';
}

function matchReasons(match) {
  if (match.directoryListing) return ['Channel you follow', 'Currently live'];
  const reasons = match.categoryMatchApplied ? ['Matching category'] : [];
  if (match.meaningfulSharedTags?.length) {
    reasons.push(`${match.meaningfulSharedTags.length} shared Twitch tag${match.meaningfulSharedTags.length === 1 ? '' : 's'}`);
  }
  if (match.viewerCountDiffPercent <= 20) reasons.push('Similar live audience');
  else if (match.viewerCountDiffPercent <= 50) reasons.push('Compatible audience size');
  if (match.averageViewerCountDiffPercent <= 25) reasons.push('Similar average viewers');
  if (match.streamDurationDiffMs <= 90 * 60 * 1000) reasons.push('Similar stream duration');
  return reasons.slice(0, 3);
}

function streamTagsHtml(match) {
  const tags = prepareTagDisplay(match.stream.tags, match.sharedTags);
  if (!tags.length) {
    return '<div class="stream-tags" aria-label="Channel tags"><span class="stream-tags__label">Tags</span><span class="stream-tags__empty">None listed</span></div>';
  }
  return `<div class="stream-tags" aria-label="Channel tags; checkmarks indicate tags shared with your stream">
    <span class="stream-tags__label">Tags</span>
    ${tags.map((tag) => `<span class="stream-tag${tag.language ? ' stream-tag--language' : ''}${tag.shared ? ' stream-tag--shared' : ''}"${tag.shared ? ` aria-label="${escapeHtml(tag.label)}, shared with your stream" title="Shared with your stream"` : ''}>${tag.shared ? '<span aria-hidden="true">✓</span> ' : ''}${escapeHtml(tag.label)}</span>`).join('')}
  </div>`;
}

function renderResults() {
  const renderGeneration = ++resultsRenderGeneration;
  if (!state.matches.length) {
    showResultNotice({
      title: state.resultsMode === 'followed-live'
        ? 'No followed channels are live'
        : 'No matching channels found',
      message: state.resultsMode === 'followed-live'
        ? 'None of the channels you follow are currently streaming.'
        : 'Try removing a tag or team filter, adding another category, or showing all viewer counts.',
    });
    el.resultsPagination.classList.add('hidden');
    el.resultsList.innerHTML = '';
    return;
  }

  el.resultsStatus.classList.add('hidden');
  const visibleMatches = state.matches.filter((match) => !state.hiddenResultIds.has(match.stream.user_id));
  if (!visibleMatches.length) {
    showResultNotice({ title: 'All results hidden', message: 'Run the search again to restore hidden channels.' });
    el.resultsPagination.classList.add('hidden');
    el.resultsList.innerHTML = '';
    return;
  }
  const sortedMatches = sortRaidMatches(visibleMatches, state.resultsSort);
  const page = paginate(sortedMatches, state.resultsPage, state.resultsPageSize);
  state.resultsPage = page.page;
  state.resultsPageSize = page.pageSize;
  el.resultsSort.value = state.resultsSort;
  el.resultsPageSize.value = String(page.pageSize);
  el.resultsPageSummary.textContent =
    `Showing ${page.startIndex + 1}–${page.endIndex} of ${visibleMatches.length} · Page ${page.page} of ${page.pageCount}${Number.isFinite(state.searchCandidateCount) ? ` · ${Math.max(0, state.searchCandidateCount - state.matches.length)} filtered out` : ''}${state.resultsFetchedAt ? ` · Updated ${fmtDuration(Date.now() - state.resultsFetchedAt)} ago` : ''}`;
  el.resultsPrevPage.disabled = page.page === 1;
  el.resultsNextPage.disabled = page.page === page.pageCount;
  el.resultsPagination.classList.remove('hidden');
  updateShortlistButton();

  el.resultsList.innerHTML = page.items
    .map((m, i) => resultCardHtml(m, page.startIndex + i + 1))
    .join('');

  loadFollowerCountsForVisiblePage(page.items, renderGeneration);

  el.resultsList.querySelectorAll('[data-raid-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const match = state.matches.find(
        (candidate) => candidate.stream.user_id === btn.dataset.raidId
      );
      if (match) openRaidDialog(match);
    });
  });

  // Click a thumbnail to load a live embedded preview in place — only one
  // plays at a time (re-rendering collapses whichever was open before).
  el.resultsList.querySelectorAll('[data-watch-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.watchId;
      state.expandedWatchId = state.expandedWatchId === id ? null : id;
      renderResults();
    });
  });

  el.resultsList.querySelectorAll('[data-close-watch]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.expandedWatchId = null;
      renderResults();
    });
  });

  el.resultsList.querySelectorAll('[data-activity-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.activityId;
      state.expandedActivityId = state.expandedActivityId === id ? null : id;
      renderResults();
    });
  });

  el.resultsList.querySelectorAll('[data-shortlist-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.shortlistId;
      if (state.shortlistedIds.has(id)) state.shortlistedIds.delete(id);
      else if (state.shortlistedIds.size < 3) state.shortlistedIds.add(id);
      else return showToast('You can compare up to three channels.');
      renderResults();
    });
  });

  el.resultsList.querySelectorAll('[data-hide-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.hiddenResultIds.add(btn.dataset.hideId);
      state.shortlistedIds.delete(btn.dataset.hideId);
      renderResults();
    });
  });

  el.resultsList.querySelectorAll('[data-refresh-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Refreshing…';
      const id = btn.dataset.refreshId;
      try {
        const stream = await state.api.getLiveStreamForUser(id);
        if (!stream) {
          state.matches = state.matches.filter((match) => match.stream.user_id !== id);
          state.shortlistedIds.delete(id);
          showToast('That channel is no longer live.');
        } else {
          const match = state.matches.find((candidate) => candidate.stream.user_id === id);
          if (match) match.stream = { ...match.stream, ...stream };
          state.resultsFetchedAt = Date.now();
        }
        renderResults();
      } catch (error) {
        btn.disabled = false;
        btn.textContent = 'Refresh';
        showToast(error.message || 'Could not refresh this channel.');
      }
    });
  });

  const expandedMatch = page.items.find(
    (match) => match.stream.user_id === state.expandedActivityId
  );
  if (expandedMatch) loadRecentActivity(expandedMatch, renderGeneration);
}

async function loadFollowerCountsForVisiblePage(matches, renderGeneration) {
  const counts = await state.api.getFollowerCountsForUsers(
    matches.map((match) => match.stream.user_id)
  );
  if (renderGeneration !== resultsRenderGeneration) return;

  el.resultsList.querySelectorAll('[data-follower-id]').forEach((node) => {
    const count = counts.get(node.dataset.followerId);
    node.textContent = Number.isFinite(count)
      ? `${fmtNumber(count)} followers`
      : 'Followers unavailable';
  });

  for (const match of matches) {
    ChannelHistory.record(match.stream, counts.get(match.stream.user_id));
  }
}

el.resultsPageSize.addEventListener('change', () => {
  state.resultsPageSize = Number(el.resultsPageSize.value);
  state.resultsPage = 1;
  state.expandedWatchId = null;
  state.expandedActivityId = null;
  renderResults();
});

el.resultsSort.addEventListener('change', () => {
  state.resultsSort = el.resultsSort.value;
  state.resultsPage = 1;
  state.expandedWatchId = null;
  state.expandedActivityId = null;
  renderResults();
});

el.resultsPrevPage.addEventListener('click', () => {
  state.resultsPage -= 1;
  state.expandedWatchId = null;
  state.expandedActivityId = null;
  renderResults();
  el.resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

el.resultsNextPage.addEventListener('click', () => {
  state.resultsPage += 1;
  state.expandedWatchId = null;
  state.expandedActivityId = null;
  renderResults();
  el.resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

function currentFilterPreset() {
  return {
    viewerTolerance: el.viewerToleranceFilter.querySelector('input:checked')?.value ?? '50',
    matchPreset: el.matchPreset.value,
    statuses: [...el.statusFilters.querySelectorAll('input:checked')].map((input) => input.value),
    onlyFollowing: el.onlyFollowingFilter.checked,
    sameTeam: el.sameTeamFilter.checked,
    matchStreamTags: el.matchStreamTags.checked,
    language: el.languageSelect.value,
    tags: el.tagsInput.value,
    genres: getSelectedGenreIds(),
    categories: state.extraCategories,
  };
}

el.saveFilterPreset.addEventListener('click', () => {
  saveFilterPreset(currentFilterPreset());
  showToast('Current filters saved on this device.');
});

el.loadFilterPreset.addEventListener('click', () => {
  const preset = loadFilterPreset();
  if (!preset) return showToast('No saved filter preset was found.');
  const tolerance = el.viewerToleranceFilter.querySelector(`[value="${preset.viewerTolerance}"]`);
  if (tolerance) tolerance.checked = true;
  el.matchPreset.value = preset.matchPreset;
  el.statusFilters.querySelectorAll('input').forEach((input) => { input.checked = preset.statuses.includes(input.value); });
  el.onlyFollowingFilter.checked = preset.onlyFollowing;
  el.sameTeamFilter.checked = preset.sameTeam;
  el.matchStreamTags.checked = preset.matchStreamTags;
  el.languageSelect.value = preset.language;
  el.tagsInput.value = preset.tags;
  el.genreFilters.querySelectorAll('input').forEach((input) => { input.checked = preset.genres.includes(input.value); });
  state.extraCategories = preset.categories;
  renderSelectedCategories();
  renderActiveFilters();
  updateViewerHint();
  showToast('Saved filters loaded.');
});

el.matchPreset.addEventListener('change', renderActiveFilters);

function updateShortlistButton() {
  const count = state.shortlistedIds.size;
  el.compareShortlistBtn.textContent = `Compare shortlist (${count})`;
  el.compareShortlistBtn.disabled = count < 2;
}

function renderComparison() {
  const matches = state.matches.filter((match) => state.shortlistedIds.has(match.stream.user_id));
  el.compareDialogContent.innerHTML = matches.map((match) => {
    const stream = match.stream;
    return `<article class="compare-card">
      <h3>${escapeHtml(stream.user_name)}</h3>
      <p>${escapeHtml(stream.game_name || 'No category')}</p>
      <dl>
        <div><dt>Match</dt><dd>${Math.round(match.matchScore)}%</dd></div>
        <div><dt>Live viewers</dt><dd>${fmtNumber(stream.viewer_count)}</dd></div>
        <div><dt>Estimated average</dt><dd>~${fmtNumber(match.estimatedAverageViewers)} · ${escapeHtml(match.historyConfidence)}</dd></div>
        <div><dt>Live for</dt><dd>${fmtDuration(Date.now() - new Date(stream.started_at).getTime())}</dd></div>
        <div><dt>Shared tags</dt><dd>${match.meaningfulSharedTags?.length ?? 0}</dd></div>
        <div><dt>Relationship</dt><dd>${stream.is_followed ? 'Following' : 'Not followed'}</dd></div>
      </dl>
      <button class="btn btn--outline" type="button" data-compare-raid="${escapeHtml(stream.user_id)}"${!state.myStream || state.usingPreviousStream ? ' disabled' : ''}>Raid this channel</button>
    </article>`;
  }).join('');
  el.compareDialogContent.querySelectorAll('[data-compare-raid]').forEach((button) => {
    button.addEventListener('click', () => {
      const match = state.matches.find((candidate) => candidate.stream.user_id === button.dataset.compareRaid);
      el.compareDialog.close();
      if (match) openRaidDialog(match);
    });
  });
}

el.compareShortlistBtn.addEventListener('click', () => {
  renderComparison();
  el.compareDialog.showModal();
});
el.compareDialogClose.addEventListener('click', () => el.compareDialog.close());

async function loadRecentActivity(match, renderGeneration) {
  const stream = match.stream;
  const panel = el.resultsList.querySelector(
    `[data-activity-panel="${stream.user_id}"]`
  );
  if (!panel) return;

  const [videosResult, clipsResult, scheduleResult, profileResult] = await Promise.allSettled([
    state.api.getBroadcastHistory(stream.user_id, { days: 30, maxResults: 100 }),
    state.api.getRecentClips(stream.user_id, { days: 30, maxResults: 3 }),
    state.api.getScheduleContext(stream.user_id),
    state.api.getBroadcasterProfile(stream.user_id),
  ]);
  if (
    renderGeneration !== resultsRenderGeneration ||
    state.expandedActivityId !== stream.user_id
  ) return;

  const videos = videosResult.status === 'fulfilled' ? videosResult.value : [];
  const clips = clipsResult.status === 'fulfilled' ? clipsResult.value : [];
  const scheduleContext = scheduleResult.status === 'fulfilled'
    ? scheduleResult.value
    : { current: null, next: null };
  const profile = profileResult.status === 'fulfilled' ? profileResult.value : null;
  const history = ChannelHistory.getSummary(stream.user_id);

  panel.innerHTML = recentActivityHtml({
    stream, match, videos, clips, scheduleContext, profile, history,
  });
  panel.querySelectorAll('[data-clip-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const clipId = button.dataset.clipId;
      const player = panel.querySelector(`[data-clip-player="${clipId}"]`);
      if (!player) return;
      const src = `https://clips.twitch.tv/embed?clip=${encodeURIComponent(
        clipId
      )}&parent=${encodeURIComponent(window.location.hostname)}&autoplay=false&muted=true`;
      player.innerHTML = `
        <iframe
          src="${src}"
          allowfullscreen
          scrolling="no"
          frameborder="0"
          title="Clip preview"
        ></iframe>`;
      button.disabled = true;
      button.textContent = 'Clip loaded';
    });
  });
}

function recentActivityHtml({ stream, match, videos, clips, scheduleContext, profile, history }) {
  const recentVods = videos.slice(0, 3);
  const accountAge = profile?.created_at ? fmtDate(profile.created_at) : 'Unavailable';
  const nextStream = scheduleContext?.next?.start_time
    ? `${fmtDate(scheduleContext.next.start_time, { dateStyle: 'medium', timeStyle: 'short' })}${scheduleContext.next.title ? ` — ${escapeHtml(scheduleContext.next.title)}` : ''}`
    : 'No upcoming stream published';
  const plannedEnd = scheduleContext?.current?.end_time
    ? fmtDate(scheduleContext.current.end_time, { dateStyle: 'medium', timeStyle: 'short' })
    : 'No current scheduled end';
  const endEstimate = estimateStreamEnd(stream.started_at, videos);
  const estimatedEndMs = endEstimate
    ? new Date(endEstimate.estimatedEndAt).getTime()
    : null;
  const estimatedEnd = endEstimate
    ? estimatedEndMs > Date.now()
      ? fmtDate(endEstimate.estimatedEndAt, { dateStyle: 'medium', timeStyle: 'short' })
      : `${fmtDuration(Date.now() - estimatedEndMs)} past typical end`
    : 'Not enough VOD history';
  const estimateBasis = endEstimate
    ? `${fmtDuration(endEstimate.medianDurationMs)} typical length · median of ${endEstimate.sampleCount} VOD${endEstimate.sampleCount === 1 ? '' : 's'}`
    : 'Requires at least one public VOD with duration';
  const categories = history?.categories?.slice(0, 4) ?? [];
  const followerGrowth = history?.sampleCount > 1 && Number.isFinite(history.followerDelta)
    ? `${history.followerDelta >= 0 ? '+' : ''}${fmtNumber(history.followerDelta)} since ${fmtDate(history.followerStartAt)}`
    : 'Collecting snapshots for future comparisons';

  const vodsHtml = recentVods.length
    ? `<ul class="activity-list">${recentVods.map((video) => `
        <li>
          <a href="${escapeHtml(video.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(video.title || 'Untitled broadcast')}</a>
          <span>${fmtDate(video.created_at)} · ${escapeHtml(video.duration || 'duration unknown')} · ${fmtNumber(video.view_count || 0)} VOD views</span>
        </li>`).join('')}</ul>`
    : '<p class="activity-empty">No public past broadcasts found in the last 30 days.</p>';

  const clipsHtml = clips.length
    ? `<div class="clip-grid">${clips.map((clip) => `
        <article class="clip-card">
          <img src="${escapeHtml(clip.thumbnail_url || '')}" alt="" loading="lazy" />
          <p>${escapeHtml(clip.title || 'Untitled clip')}</p>
          <span>${fmtNumber(clip.view_count || 0)} views · ${fmtDate(clip.created_at)}</span>
          <button class="btn btn--ghost" type="button" data-clip-id="${escapeHtml(clip.id)}">Preview clip</button>
          <a href="${escapeHtml(clip.url)}" target="_blank" rel="noopener noreferrer">Open clip ↗</a>
          <div class="clip-player" data-clip-player="${escapeHtml(clip.id)}"></div>
        </article>`).join('')}</div>`
    : '<p class="activity-empty">No clips found from the last 30 days.</p>';

  return `
    <div class="activity-overview">
      <div><strong>~${fmtNumber(match.estimatedAverageViewers)}</strong><span>average viewers${match.averageIsHistorical ? '' : ' · early estimate'}</span></div>
      <div><strong>${videos.length}</strong><span>streams in 30 days</span></div>
      <div><strong>${escapeHtml(accountAge)}</strong><span>account created</span></div>
      <div><strong>${escapeHtml(followerGrowth)}</strong><span>local follower growth</span></div>
      <div><strong>${escapeHtml(estimatedEnd)}</strong><span>estimated end · ${escapeHtml(estimateBasis)}</span></div>
    </div>
    <p class="activity-schedule"><strong>Current scheduled end:</strong> ${escapeHtml(plannedEnd)}</p>
    <p class="activity-schedule"><strong>Next scheduled:</strong> ${nextStream}</p>
    <p class="activity-history"><strong>Observed categories:</strong> ${categories.length ? categories.map(escapeHtml).join(', ') : `First snapshot recorded for ${escapeHtml(stream.game_name)}`}</p>
    <h4>Recent broadcasts</h4>
    ${vodsHtml}
    <h4>Popular clips from the last 30 days</h4>
    ${clipsHtml}
    <p class="activity-note">The estimated end uses the median length of recent public VODs and is not a Twitch-confirmed end time. Scheduled times are plans published by the streamer. VOD views are total replay views, not average live viewers.</p>`;
}

function contentLabelsHtml(stream) {
  const labels = (stream.content_classification_labels ?? [])
    .map((label) => CONTENT_LABELS[label] ?? label)
    .filter(Boolean);
  if (stream.is_mature && !labels.includes('Mature')) labels.unshift('Mature');
  if (!labels.length) return '';
  return `<div class="content-labels" aria-label="Content warnings">${labels
    .map((label) => `<span class="content-label">${escapeHtml(label)}</span>`)
    .join('')}</div>`;
}

function watchMediaHtml(stream) {
  const isPlaying = state.expandedWatchId === stream.user_id;

  if (isPlaying) {
    // Twitch's player just needs a `parent` matching the hosting domain —
    // no extra app registration required beyond the OAuth redirect URL.
    const embedSrc = `https://player.twitch.tv/?channel=${encodeURIComponent(
      stream.user_login
    )}&parent=${encodeURIComponent(window.location.hostname)}&muted=true`;
    return `
      <div class="card-media card-media--playing">
        <button type="button" class="card-media__close" data-close-watch aria-label="Close preview">✕</button>
        <iframe
          src="${embedSrc}"
          allowfullscreen
          scrolling="no"
          frameborder="0"
          title="Live preview of ${escapeHtml(stream.user_name)}"
        ></iframe>
      </div>`;
  }

  const thumb = (stream.thumbnail_url || '')
    .replace('{width}', '440')
    .replace('{height}', '248');
  return `
    <button type="button" class="card-media card-media--preview" data-watch-id="${escapeHtml(stream.user_id)}" aria-label="Watch ${escapeHtml(stream.user_name)} live">
      ${thumb ? `<img src="${escapeHtml(thumb)}" alt="" loading="lazy" />` : ''}
      <span class="card-media__live-badge"><span class="card-media__live-dot"></span>LIVE</span>
      <span class="card-media__play">▶</span>
    </button>`;
}

function resultCardHtml(match, rank) {
  const s = match.stream;
  const isDirectoryListing = Boolean(match.directoryListing);
  const scorePct = Math.round(match.matchScore);
  // Analog meter needle: -90deg (0%) to +90deg (100%).
  const needleDeg = -90 + (scorePct / 100) * 180;
  const statusLabel = STATUS_LABELS[s.broadcaster_type ?? 'none'];
  const raidButton = !state.myStream || state.usingPreviousStream
    ? '<button class="btn btn--outline" disabled title="You must be live to start a raid">Go live to raid</button>'
    : `<button class="btn btn--outline" data-raid-id="${escapeHtml(s.user_id)}">Raid this channel</button>`;
  const previewButton = state.expandedWatchId === s.user_id
    ? `<button class="btn btn--ghost" type="button" data-watch-id="${escapeHtml(s.user_id)}">Close preview</button>`
    : `<button class="btn btn--ghost" type="button" data-watch-id="${escapeHtml(s.user_id)}">Preview stream</button>`;
  const activityExpanded = state.expandedActivityId === s.user_id;
  const activityButton = `<button class="btn btn--ghost result-card__activity-button" type="button" data-activity-id="${escapeHtml(s.user_id)}" aria-expanded="${activityExpanded}">${activityExpanded ? 'Close details' : 'View details'}</button>`;
  const followingText = s.followed_at
    ? `Following since ${fmtDate(s.followed_at, { month: 'short', year: 'numeric' })}`
    : 'Following';

  return `
    <li class="result-card">
      <div class="result-card__header">
        <span class="result-card__rank">${rank}</span>
        <div class="result-card__identity">
          <span class="result-card__name">${escapeHtml(s.user_name)}</span>
          <span class="result-card__match-label">${isDirectoryListing ? 'Live channel you follow' : scoreLabel(scorePct)}</span>
        </div>
        ${isDirectoryListing ? '<span class="following-tag">Following · live now</span>' : `<div class="meter ${scoreClass(scorePct)}" title="${scorePct}% match — ${scoreLabel(scorePct)}" aria-label="${scorePct}% match, ${scoreLabel(scorePct)}">
          <div class="meter__arc"></div>
          <div class="meter__needle" style="transform: rotate(${needleDeg}deg)"></div>
          <div class="meter__value">${scorePct}</div>
        </div>`}
      </div>
      ${watchMediaHtml(s)}
      <p class="result-card__title">${escapeHtml(s.title)}</p>
      <p class="result-card__game">${escapeHtml(s.game_name)} · <span class="status-tag status-tag--${s.broadcaster_type ?? 'none'}">${statusLabel}</span>${s.is_followed ? ` · <span class="following-tag">${escapeHtml(followingText)}</span>` : ''}${s.shared_team_names?.length ? ` · <span class="team-tag">${escapeHtml(s.shared_team_names[0])}</span>` : ''}</p>
      ${contentLabelsHtml(s)}
      ${streamTagsHtml(match)}
      <div class="match-reasons" aria-label="Why this channel matches">${matchReasons(match).map((reason) => `<span><span aria-hidden="true">✓</span> ${escapeHtml(reason)}</span>`).join('')}</div>
      <div class="stat-row">
        <span class="stat-chip"><span class="stat-chip__mono">${fmtNumber(s.viewer_count)}</span> live</span>
        <span class="stat-chip" title="${escapeHtml(match.historyConfidence)}"><span class="stat-chip__mono">~${fmtNumber(match.estimatedAverageViewers)}</span> average · ${escapeHtml(match.historyConfidence)}</span>
        <span class="stat-chip"><span class="stat-chip__mono">${fmtDuration(Date.now() - new Date(s.started_at).getTime())}</span> live</span>
        <span class="stat-chip" data-follower-id="${escapeHtml(s.user_id)}">Loading followers…</span>
      </div>
      <div class="result-card__actions">
        <a class="watch-link" href="https://twitch.tv/${escapeHtml(s.user_login)}" target="_blank" rel="noopener noreferrer">Open on Twitch ↗</a>
      </div>
      ${activityButton}
      ${activityExpanded ? `<section class="recent-activity" data-activity-panel="${escapeHtml(s.user_id)}" aria-label="Details for ${escapeHtml(s.user_name)}"><p class="activity-empty"><strong>Estimated average:</strong> ~${fmtNumber(match.estimatedAverageViewers)} viewers${match.averageIsHistorical ? '' : ' (early estimate)'}<br />Loading channel history…</p></section>` : ''}
      <div class="result-card__buttons">
        <button class="btn btn--ghost" type="button" data-shortlist-id="${escapeHtml(s.user_id)}">${state.shortlistedIds.has(s.user_id) ? 'Remove shortlist' : 'Shortlist'}</button>
        <button class="btn btn--ghost" type="button" data-refresh-id="${escapeHtml(s.user_id)}">Refresh</button>
        <button class="btn btn--ghost" type="button" data-hide-id="${escapeHtml(s.user_id)}">Hide</button>
        ${previewButton}
        ${raidButton}
      </div>
    </li>`;
}

// ---- Raid confirm dialog -----------------------------------------------

let pendingRaid = null;

function clearRaidTimers() {
  clearInterval(state.raidCountdownTimer);
  state.raidCountdownTimer = null;
}

function clearActiveRaid({ closeDialog = true } = {}) {
  clearRaidTimers();
  state.activeRaid = null;
  state.raidCompletionInProgress = false;
  el.raidProgressDialog.classList.remove('raid-progress-dialog--complete');
  if (closeDialog && el.raidProgressDialog.open) el.raidProgressDialog.close();
}

function showRaidAwaitingConfirmation() {
  if (!state.activeRaid) return;
  clearRaidTimers();
  el.raidProgressTitle.textContent = 'Waiting for Twitch confirmation…';
  el.raidProgressText.textContent = state.activeRaid.sendCompletionMessage
    ? 'The countdown ended. Your approved message will only be sent after Twitch confirms this exact destination through EventSub.'
    : 'The countdown ended. Waiting for Twitch to confirm the raid; no chat message will be sent.';
  el.raidCountdownValue.textContent = '0';
  el.raidProgressBar.style.width = '100%';
  el.raidProgressRing.style.setProperty('--raid-progress', '360deg');
  el.raidProgressCancelBtn.disabled = true;
}

function renderRaidCountdown() {
  if (!state.activeRaid) return;
  const snapshot = getRaidCountdownSnapshot(state.activeRaid);
  el.raidCountdownValue.textContent = String(snapshot.remainingSeconds);
  el.raidProgressBar.style.width = `${snapshot.progressPercent}%`;
  el.raidProgressRing.style.setProperty('--raid-progress', `${snapshot.progressPercent * 3.6}deg`);

  if (snapshot.complete) showRaidAwaitingConfirmation();
}

function beginRaidCountdown(target, createdAt, { sendCompletionMessage, completionMessage }) {
  clearActiveRaid();
  state.activeRaid = createRaidCountdown({
    userId: target.stream.user_id,
    userName: target.stream.user_name,
    userLogin: target.stream.user_login,
    createdAt,
    sendCompletionMessage,
    completionMessage,
  });
  state.raidCompletionInProgress = false;
  el.raidProgressTitle.textContent = `Raiding ${target.stream.user_name}`;
  el.raidProgressText.textContent = sendCompletionMessage
    ? 'Twitch is preparing your viewers. Your approved message will only be sent after EventSub confirms this destination.'
    : 'Twitch is preparing your viewers. No completion message will be sent.';
  const thumbnail = (target.stream.thumbnail_url || '')
    .replace('{width}', '160')
    .replace('{height}', '160');
  el.raidProgressAvatar.src = thumbnail;
  el.raidProgressAvatar.alt = `${target.stream.user_name} live preview`;
  el.raidProgressAvatar.classList.toggle('hidden', !thumbnail);
  el.raidProgressAudience.textContent = `${fmtNumber(state.myStream?.viewer_count ?? 0)} viewers are preparing to travel through the wormhole.`;
  el.raidControlsLink.href = getTwitchRaidControlsUrl(state.user.login);
  el.raidProgressCancelBtn.disabled = false;
  renderRaidCountdown();
  if (!el.raidProgressDialog.open) el.raidProgressDialog.showModal();
  state.raidCountdownTimer = setInterval(renderRaidCountdown, 250);
}

async function handleRaidCompleted(event) {
  if (!state.activeRaid) {
    showToast(`Raid completed to ${event.to_broadcaster_user_name}!`);
    return;
  }
  if (!isMatchingRaidConfirmation(state.activeRaid, event)) return;

  if (state.raidCompletionInProgress) return;
  state.raidCompletionInProgress = true;

  if (event.to_broadcaster_user_login) {
    state.activeRaid.userLogin = event.to_broadcaster_user_login;
  }
  const target = {
    userId: state.activeRaid.userId,
    userLogin: state.activeRaid.userLogin,
    userName: event.to_broadcaster_user_name || state.activeRaid.userName,
  };

  clearRaidTimers();
  el.raidProgressTitle.textContent = 'Raid confirmed!';
  const shouldSendMessage = Boolean(state.activeRaid.sendCompletionMessage);
  const completionMessage = state.activeRaid.completionMessage;
  el.raidProgressText.textContent = shouldSendMessage
    ? `Twitch confirmed the raid to ${target.userName}. Sending your approved completion message…`
    : `Twitch confirmed the raid to ${target.userName}. No chat message was requested.`;
  el.raidProgressCancelBtn.disabled = true;

  let delivery = null;
  let deliveryError = null;
  if (shouldSendMessage) {
    try {
      delivery = await state.api.sendChatMessage(
        target.userId,
        state.user.id,
        completionMessage
      );
    } catch (error) {
      console.error(error);
      deliveryError = error;
    }
  }

  if (!state.activeRaid || state.activeRaid.userId !== target.userId) return;
  showRaidDestination(target, {
    delivery,
    deliveryError,
    messageRequested: shouldSendMessage,
    completionMessage,
  });
}

function showRaidDestination(target, {
  delivery,
  deliveryError,
  messageRequested = false,
  completionMessage = '',
} = {}) {
  const embeds = getRaidDestinationEmbedUrls(target.userLogin, window.location.hostname);
  const messageStatus = !messageRequested
    ? 'Raid complete. You chose not to send a completion message.'
    : deliveryError
    ? 'The raid completed, but Twitch could not send the Wormhole completion message.'
    : delivery?.is_sent
      ? `Raid complete. “${completionMessage}” was sent to chat.`
      : `Raid complete, but Twitch did not send the completion message${delivery?.drop_reason?.message ? `: ${delivery.drop_reason.message}` : '.'}`;

  el.raidDestinationTitle.textContent = `Now watching ${target.userName}`;
  el.raidDestinationStatus.textContent = messageStatus;
  el.raidDestinationPlayer.src = embeds.video;
  el.raidDestinationPlayer.title = `${target.userName} live on Twitch`;
  el.raidDestinationChat.src = embeds.chat;
  el.raidDestinationChat.title = `${target.userName} Twitch chat`;
  el.raidDestinationOpenLink.href = `https://www.twitch.tv/${encodeURIComponent(target.userLogin)}`;
  el.discoveryView.classList.add('hidden');
  el.raidDestinationView.classList.remove('hidden');
  if (el.raidProgressDialog.open) el.raidProgressDialog.close();
  clearRaidTimers();
  state.activeRaid = null;
  state.raidCompletionInProgress = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

el.raidDestinationBackBtn.addEventListener('click', () => {
  el.raidDestinationPlayer.src = 'about:blank';
  el.raidDestinationChat.src = 'about:blank';
  el.raidDestinationView.classList.add('hidden');
  el.discoveryView.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

function openRaidDialog(match) {
  pendingRaid = match;
  el.raidDialogText.textContent = `Raid ${match.stream.user_name} with your viewers right now?`;
  el.raidMessageOptIn.checked = false;
  el.raidMessageOptIn.disabled = state.eventSubStatus !== 'connected';
  el.raidMessagePreview.textContent = buildRaidCompletionMessage(match.stream.user_login);
  el.raidDialog.showModal();
}

el.raidCancelBtn.addEventListener('click', () => {
  pendingRaid = null;
  el.raidDialog.close();
});

el.raidConfirmBtn.addEventListener('click', async () => {
  if (!pendingRaid) return;
  const target = pendingRaid;
  const completionMessage = buildRaidCompletionMessage(target.stream.user_login);
  const sendCompletionMessage = el.raidMessageOptIn.checked;
  el.raidDialog.close();
  try {
    const currentTargetStream = await state.api.getLiveStreamForUser(target.stream.user_id);
    if (!currentTargetStream) {
      showToast(`${target.stream.user_name} is no longer live. The raid was not started.`, true);
      pendingRaid = null;
      return;
    }
    target.stream = { ...target.stream, ...currentTargetStream };
    const raid = await state.api.startRaid(state.user.id, target.stream.user_id);
    beginRaidCountdown(target, raid?.created_at, {
      sendCompletionMessage,
      completionMessage,
    });
  } catch (e) {
    console.error(e);
    const messages = {
      400: 'Twitch would not allow this raid. The channel may restrict incoming raids.',
      401: 'Your Twitch permission expired. Log out and back in, then try again.',
      404: 'That channel is no longer available.',
      409: 'A raid countdown is already in progress.',
      429: 'Twitch’s raid limit was reached. Please wait before trying again.',
    };
    showToast(messages[e.status] ?? 'Could not start the raid. Please try again.', true);
  }
  pendingRaid = null;
});

el.raidProgressDialog.addEventListener('cancel', (event) => {
  // Escape must not hide an active raid while Twitch's countdown continues.
  event.preventDefault();
});

el.raidProgressCancelBtn.addEventListener('click', async () => {
  if (!state.activeRaid) return;
  el.raidProgressCancelBtn.disabled = true;
  el.raidProgressText.textContent = 'Canceling the raid…';
  try {
    await state.api.cancelRaid(state.user.id);
    clearActiveRaid();
    showToast('Raid canceled.');
  } catch (error) {
    console.error(error);
    el.raidProgressCancelBtn.disabled = false;
    el.raidProgressText.textContent =
      error.status === 404
        ? 'The raid is no longer pending. Waiting for Twitch to confirm completion…'
        : 'Twitch could not cancel the raid. Try again before the countdown ends.';
  }
});

// ---- Utils ---------------------------------------------------------

function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

init();

import { TWITCH_CONFIG } from './twitch-config-v90.js?v=90';
import { TwitchAuth } from './twitch-auth.js?v=90';
import { TwitchApi } from './twitch-api.js?v=90';
import { getTwitchTrackerSummary } from './twitchtracker-summary.js?v=90';
import { loadCreatorDetails } from './services/creator-details.js?v=90';
import { attachContentClassificationLabels } from './services/content-labels.js?v=90';
import { logger } from './app/logger.js?v=90';
import { recentActivityHtml } from './results/recent-activity.js?v=90';
import { configureResultsController, renderResults } from './results/controller.js?v=90';
import { configureRaidController, clearActiveRaid, handleRaidCompleted, openRaidDialog } from './raid/controller.js?v=90';
import { applyHardFilters, findRaidMatches } from './raid-match.js?v=90';
import { configureSearchController, invalidateSearch, runSearch } from './search/controller.js?v=90';
import {
  configureFiltersController, getSelectedStatuses, getCustomTagsQuery, renderSuggestedTags,
  getContentLabelFilter, applyContentLabelFilterToControls, getSelectedLanguageTag, getTagsQuery,
  getMeaningfulMyTags, renderTagMatchHint, getSelectedGenreIds, getViewerTolerancePercent,
  renderActiveFilters, applyGenreSelection,
} from './search/filters.js?v=90';
import { runCategorySearch, renderSelectedCategories } from './search/categories.js?v=90';
import { loadingCardsHtml, showSearchStatus, showResultNotice, configureSearchUi } from './search/ui.js?v=90';
import { RaidListener } from './raid-listener.js?v=90';
import { ViewerHistory } from './viewer-history.js?v=90';
import { PreviousStreamHistory } from './previous-stream-history.js?v=90';
import { paginate } from './pagination.js?v=90';
import { sortRaidMatches } from './result-sort.js?v=90';
import { calculateViewerRange, describeViewerRange, parseViewerTolerance } from './viewer-tolerance.js?v=90';
import {
  createRaidCountdown,
  getRaidCountdownSnapshot,
} from './raid-countdown.js?v=90';
import { ChannelHistory } from './channel-history.js?v=90';
import { estimateStreamEnd, parseTwitchDuration } from './stream-end-estimate.js?v=90';
import {
  getGenreGameNames,
  getGenreLabelsForGame,
} from './genre-presets.js?v=90';
import { isLanguageTag, parseTagInput } from './language-tags.js?v=90';
import { getSearchedTagMatch, normalizeTagKey, prepareTagDisplay } from './tag-display.js?v=90';
import { normalizeTwitchLogin } from './direct-search.js?v=90';
import { buildTwitchPlayerUrl, buildTwitchWatchUrl } from './twitch-player.js?v=90';
import { buildFollowedDirectoryMatches } from './followed-directory.js?v=90';
import { resolveDiscoveryMode } from './discovery-mode.js?v=90';
import { loadFilterPreset, saveFilterPreset } from './filter-preset-storage.js?v=90';
import {
  getRaidDestinationEmbedUrls,
  getTwitchRaidControlsUrl,
  isMatchingRaidConfirmation,
} from './raid-completion.js?v=90';
import { DiagnosticsLog } from './diagnostics.js?v=90';
import { StorageConsent } from './storage-consent.js?v=90';
import {
  getRaidAuthorizationFailure,
  getRaidChannelFailure,
  releaseRaidActionLock,
  tryAcquireRaidActionLock,
} from './raid-security.js?v=90';
import {
  CONTENT_FILTER_LABELS,
  filterStreamsByContentLabels,
  normalizeContentLabelFilter,
} from './content-label-filter.js?v=90';
import {
  finishLoading,
  initializeGlobalLoading,
  startLoading,
  withLoading,
} from './loading-state.js?v=90';

initializeGlobalLoading();

const diagnostics = new DiagnosticsLog({
  version: '0.0.90',
  canPersist: () => StorageConsent.allowsLocalHistory(),
});
diagnostics.installGlobalHandlers(window);

const TOKEN_VALIDATION_INTERVAL_MS = 60 * 60 * 1000;

import { state } from './app/state.js?v=90';


diagnostics.setContextProvider(() => ({
  streamState: state.myStream ? 'live' : state.usingPreviousStream ? 'previous-stream' : 'offline',
  eventSubStatus: state.eventSubStatus,
  resultsMode: state.resultsMode,
}));

import { el } from './app/elements.js?v=90';


const STATUS_LABELS = {
  partner: 'Partner',
  affiliate: 'Affiliate',
  none: 'Non-affiliate',
};

const CONTENT_LABELS = {
  DebatedSocialIssuesAndPolitics: 'Politics and sensitive social issues',
  DrugsIntoxication: 'Drugs / intoxication',
  Gambling: 'Gambling',
  MatureGame: 'Mature-rated game',
  ProfanityVulgarity: 'Profanity',
  SexualThemes: 'Sexual themes',
  ViolentGraphic: 'Graphic violence',
};

import { escapeHtml, fmtDate, fmtDuration, fmtNumber } from './app/format.js?v=90';


function showToast(message, isError = false) {
  el.toastMessage.textContent = message;
  el.toast.classList.toggle('toast--error', isError);
  el.toast.classList.add('toast--visible');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => el.toast.classList.remove('toast--visible'), 10_000);
}

configureResultsController({
  showToast,
  showResultNotice: (...args) => showResultNotice(...args),
  preferredScrollBehavior: () => preferredScrollBehavior(),
  getCustomTagsQuery: () => getCustomTagsQuery(),
  attachContentClassificationLabels: (...args) => attachContentClassificationLabels(...args),
  openRaidDialog: (...args) => openRaidDialog(...args),
});
configureRaidController({
  showToast,
  renderStreamPanel: (...args) => renderStreamPanel(...args),
  endInvalidTwitchSession: (...args) => endInvalidTwitchSession(...args),
});
configureSearchController({
  showToast,
  showResultNotice: (...args) => showResultNotice(...args),
  showSearchStatus: (...args) => showSearchStatus(...args),
  loadingCardsHtml: (...args) => loadingCardsHtml(...args),
  getSelectedStatuses: () => getSelectedStatuses(),
  getViewerTolerancePercent: () => getViewerTolerancePercent(),
  getCustomTagsQuery: () => getCustomTagsQuery(),
  getSelectedLanguageTag: () => getSelectedLanguageTag(),
  getContentLabelFilter: () => getContentLabelFilter(),
  attachContentClassificationLabels: (...args) => attachContentClassificationLabels(...args),
  renderResults: (...args) => renderResults(...args),
  invalidateFollowedLive: () => { followedLiveGeneration += 1; },
});
configureFiltersController({
  runSearch: (...args) => runSearch(...args),
  renderResults: (...args) => renderResults(...args),
  renderViewerMatchHint: (...args) => renderViewerMatchHint(...args),
  renderSelectedCategories: (...args) => renderSelectedCategories(...args),
  showToast,
  updateViewerHint: (...args) => updateViewerHint(...args),
  invalidateSearch: (...args) => invalidateSearch(...args),
});
configureSearchUi({ runSearch: (...args) => runSearch(...args) });





el.toastClose.addEventListener('click', () => {
  clearTimeout(showToast._t);
  el.toast.classList.remove('toast--visible');
});

function renderDiagnostics() {
  const entries = diagnostics.entries();
  const persisted = StorageConsent.allowsLocalHistory();
  el.diagnosticsStorageStatus.textContent = `${entries.length} event${entries.length === 1 ? '' : 's'}. ${persisted
    ? 'Saved locally because local history is allowed.'
    : 'Kept for this browser session only.'}`;
  el.diagnosticsPreview.textContent = entries.length
    ? diagnostics.toText()
    : 'No diagnostic events have been recorded.';
  el.diagnosticsClear.disabled = entries.length === 0;
  el.diagnosticsCopy.disabled = entries.length === 0;
}

el.diagnosticsOpen.addEventListener('click', () => {
  renderDiagnostics();
  el.diagnosticsDialog.showModal();
});
el.diagnosticsClose.addEventListener('click', () => el.diagnosticsDialog.close());
el.diagnosticsClear.addEventListener('click', () => {
  diagnostics.clear();
  renderDiagnostics();
  showToast('Diagnostics cleared.');
});
el.diagnosticsCopy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(diagnostics.toText());
    showToast('Diagnostics copied.');
  } catch {
    showToast('Could not copy diagnostics. Download the JSON file instead.', true);
  }
});
el.diagnosticsDownload.addEventListener('click', () => {
  const blob = new Blob([diagnostics.toText()], { type: 'text/plain;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = `wormhole-error-log-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
  showToast('Error log downloaded. Post it in #bug-reports in the Wormhole Discord for help.');
});
window.addEventListener('wormhole:storage-choice', (event) => {
  diagnostics.setPersistenceEnabled(event.detail?.choice === 'history');
  if (event.detail?.choice !== 'history') {
    ViewerHistory.invalidateCache();
    ChannelHistory.invalidateCache();
  }
  if (el.diagnosticsDialog.open) renderDiagnostics();
});
window.addEventListener('wormhole:local-history-cleared', () => {
  diagnostics.clear();
  ViewerHistory.invalidateCache();
  ChannelHistory.invalidateCache();
  if (el.diagnosticsDialog.open) renderDiagnostics();
});

function preferredScrollBehavior() {
  return document.documentElement.hasAttribute('data-reduce-motion') ||
    globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';
}

function showView(view) {
  el.loginView.classList.toggle('hidden', view !== 'login');
  el.appView.classList.toggle('hidden', view !== 'app');
}

// ---- Login flow -----------------------------------------------------

el.loginBtn.addEventListener('click', () => {
  if (TWITCH_CONFIG.clientId === 'YOUR_TWITCH_CLIENT_ID') {
    el.loginError.textContent =
      'Set your Twitch Client ID in js/twitch-config-v90.js before logging in.';
    return;
  }
  try {
    TwitchAuth.redirectToLogin();
  } catch (error) {
    logger.error(error);
    diagnostics.record({ area: 'login', message: error?.message || 'Twitch login could not start' });
    el.loginError.textContent = error instanceof Error
      ? error.message
      : 'Could not start Twitch login. Check that browser storage is enabled and try again.';
  }
});

function stopHourlyTokenValidation() {
  clearInterval(state.tokenValidationTimer);
  state.tokenValidationTimer = null;
}

function renderRaidPermissionControls() {
  document.querySelectorAll('[data-enable-raid-permission]').forEach((button) => {
    button.textContent = state.raidPermissionEnabled
      ? 'Raid controls enabled'
      : 'Enable raid controls';
    button.disabled = state.raidPermissionEnabled;
    button.setAttribute('aria-pressed', String(state.raidPermissionEnabled));
  });
}

function updateRaidPermission(validation) {
  const previous = state.raidPermissionEnabled;
  state.raidPermissionEnabled = TwitchAuth.hasScopes(
    validation,
    TWITCH_CONFIG.raidScopes
  );
  renderRaidPermissionControls();
  if (previous !== state.raidPermissionEnabled && state.matches.length) renderResults();
}

async function endInvalidTwitchSession(message) {
  await logout();
  el.loginError.textContent = message;
}

async function runHourlyTokenValidation(token) {
  const status = await TwitchAuth.validateToken(token, {
    requiredScopes: TWITCH_CONFIG.discoveryScopes,
  });
  if (status.valid) {
    if (String(status.validation?.user_id) !== String(state.user?.id)) {
      await endInvalidTwitchSession('Your Twitch account identity changed. Log in again to continue safely.');
      return;
    }
    state.tokenValidation = status.validation;
    updateRaidPermission(status.validation);
    return;
  }
  if (status.reason === 'unavailable') {
    diagnostics.record({
      level: 'warning',
      area: 'authentication',
      message: 'Hourly Twitch token validation was temporarily unavailable',
    });
    return;
  }
  await endInvalidTwitchSession('Your Twitch authorization is no longer valid. Log in again to continue.');
}

function startHourlyTokenValidation(token) {
  stopHourlyTokenValidation();
  state.tokenValidationTimer = setInterval(() => {
    runHourlyTokenValidation(token).catch((error) => diagnostics.record({
      level: 'warning',
      area: 'authentication',
      message: 'Hourly Twitch token validation failed unexpectedly',
      details: { error },
    }));
  }, TOKEN_VALIDATION_INTERVAL_MS);
}

function requestRaidPermission() {
  if (state.raidPermissionEnabled) return;
  document.querySelectorAll('[data-enable-raid-permission]').forEach((button) => {
    button.disabled = true;
    button.textContent = 'Opening Twitch...';
  });
  try {
    TwitchAuth.redirectToLogin({ includeRaidPermission: true });
  } catch (error) {
    renderRaidPermissionControls();
    showToast(error?.message || 'Could not request Twitch raid permission.', true);
  }
}

document.addEventListener('click', (event) => {
  if (event.target?.closest?.('[data-enable-raid-permission]')) requestRaidPermission();
});

async function logout() {
  invalidateSearch();
  stopHourlyTokenValidation();
  clearActiveRaid();
  await TwitchAuth.logout();
  state.raidListener?.stop();
  state.raidListener = null;
  state.api = null;
  state.user = null;
  state.myStream = null;
  state.twitchTrackerSummary = null;
  state.matches = [];
  state.startupIssue = null;
  state.tokenValidation = null;
  state.raidPermissionEnabled = false;
  state.raidActionInProgress = false;
  renderRaidPermissionControls();
  el.showFollowedLiveBtn.disabled = true;
  showView('login');
}

el.logoutBtns.forEach((button) => button.addEventListener('click', logout));

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
    logger.error('Full Twitch profile unavailable; using validated identity:', error);
  }
  const [streamResult, teamsResult, channelResult, vodResult, trackerResult] = await Promise.allSettled([
    state.api.getLiveStreamForUser(state.user.id),
    state.api.getChannelTeams(state.user.id),
    state.api.getChannelInformation(state.user.id),
    state.api.getRecentArchives(state.user.id, { maxResults: 5 }),
    getTwitchTrackerSummary(state.user.login),
  ]);
  state.myStream = streamResult.status === 'fulfilled' ? streamResult.value : null;
  state.myTeams = teamsResult.status === 'fulfilled' ? teamsResult.value : [];
  state.channelInfo = channelResult.status === 'fulfilled' ? channelResult.value : null;
  state.recentVods = vodResult.status === 'fulfilled' ? vodResult.value : [];
  state.twitchTrackerSummary = trackerResult.status === 'fulfilled' ? trackerResult.value : null;
  if (trackerResult.status === 'rejected') {
    logger.warn('TwitchTracker 30-day summary unavailable; Wormhole will use Twitch/live or locally observed data instead.', trackerResult.reason);
  }
  if (streamResult.status === 'rejected') {
    state.startupIssue ??= createStartupIssue('Live status', streamResult.reason);
    startupWarnings.push('Twitch did not return your live status. You can still use offline matching and try the live check again later.');
    logger.error('Live status unavailable during startup:', streamResult.reason);
  }
  state.selectedPreviousVodId = state.recentVods[0]?.id ?? null;
  state.usingPreviousStream = false;
  el.showFollowedLiveBtn.disabled = false;
  el.followedLiveStatus.textContent = 'Ready to load every followed channel currently live.';
  if (state.myStream) {
    PreviousStreamHistory.record(state.myStream);
    ViewerHistory.recordSamples({
      [state.myStream.user_id]: {
        viewerCount: state.myStream.viewer_count,
        streamStartedAt: state.myStream.started_at,
      },
    });
  }
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
      logger.error('Raid confirmation listener could not start:', error);
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
      if (status === 'error') diagnostics.record({
        area: 'raid-confirmation',
        message: 'Twitch raid confirmation connection failed',
      });
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
}

async function init() {
  try {
    const redirectUri = TWITCH_CONFIG.redirectUri;
    if (el.oauthRedirectUri) el.oauthRedirectUri.textContent = redirectUri;
  } catch (error) {
    el.loginError.textContent = error instanceof Error ? error.message : 'This address cannot be used for Twitch login.';
    showView('login');
    return;
  }
  let capturedToken;
  let callbackWarning = '';
  try {
    capturedToken = TwitchAuth.captureRedirectToken();
  } catch (error) {
    callbackWarning = error.message;
    if (!TwitchAuth.getSavedToken()) {
      el.loginError.textContent = error.message;
      showView('login');
      return;
    }
  }
  const token = capturedToken ?? TwitchAuth.getSavedToken();

  if (!token) {
    showView('login');
    return;
  }

  const tokenStatus = await TwitchAuth.validateToken(token);
  if (!tokenStatus.valid && tokenStatus.reason !== 'unavailable') {
    diagnostics.record({ area: 'authentication', message: 'Twitch token validation failed', details: { reason: tokenStatus.reason } });
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
    diagnostics.record({ area: 'authentication', message: 'Twitch token validation was unavailable' });
    el.loginError.textContent = 'Twitch could not be reached to verify your login. Your session was kept; check your connection and refresh.';
    showView('login');
    return;
  }

  state.api = new TwitchApi(token, {
    onError: (event) => diagnostics.record({
      level: event.level ?? 'error',
      area: 'twitch-api',
      message: event.message,
      details: {
        endpoint: event.endpoint,
        method: event.method,
        status: event.status,
        failureType: event.failureType,
        failedRequests: event.failedRequests,
      },
    }),
  });
  state.tokenValidation = tokenStatus.validation;
  updateRaidPermission(tokenStatus.validation);
  startHourlyTokenValidation(token);
  try {
    await loadCurrentUser(tokenStatus.validation);
    if (callbackWarning) showToast(`${callbackWarning} Your previous Wormhole session was kept.`, true);
  } catch (e) {
    logger.error(e);
    stopHourlyTokenValidation();
    diagnostics.record({ area: 'startup', message: e?.message || 'Wormhole startup failed', details: { status: e?.status } });
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
  // The adjacent visible username already identifies the account; keeping the
  // avatar decorative prevents screen readers from announcing the name twice.
  el.userAvatar.alt = '';
}

async function refreshLiveStatus() {
  const loadingId = startLoading('Checking your Twitch live status...');
  try {
    state.myStream = await state.api.getLiveStreamForUser(state.user.id);
    state.startupIssue = null;
    state.usingPreviousStream = false;
    if (state.myStream) {
      PreviousStreamHistory.record(state.myStream);
      ViewerHistory.recordSamples({
        [state.myStream.user_id]: {
          viewerCount: state.myStream.viewer_count,
          streamStartedAt: state.myStream.started_at,
        },
      });
    }
    renderStreamPanel();
    if (state.myStream && !state.raidListener) startRaidListener();
    if (!state.myStream) {
      state.raidListener?.stop();
      state.raidListener = null;
      state.eventSubStatus = 'standby';
      renderEventSubStatus();
    }
  } catch (error) {
    logger.error(error);
    state.startupIssue = createStartupIssue('Live status', error);
    state.raidListener?.stop();
    state.raidListener = null;
    state.eventSubStatus = 'data-error';
    renderEventSubStatus();
    renderStreamPanel();
  } finally {
    finishLoading(loadingId);
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
      event.currentTarget.textContent = 'Retrying...';
      await withLoading('Retrying Twitch data...', () => loadCurrentUser(state.tokenValidation));
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
    const offlineMedia = selectedVod
      ? ownStreamMediaHtml({ videoId: selectedVod.id, title: selectedVod.title, isLive: false })
      : '';
    el.streamPanel.innerHTML = `
      <div class="offline-card">
        <div class="offline-card__dot"></div>
        <p class="offline-card__title">You're not live right now.</p>
        ${offlineMedia}
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
    el.findBtn.disabled = !el.onlyFollowingFilter.checked;
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
  const rollingAverage = historical ? null : ViewerHistory.getAverage(s.user_id);
  const trackerAverage = historical ? null : state.twitchTrackerSummary?.averageViewers;
  const selectedVod = historical ? getSelectedPreviousVod() : null;
  const liveSelectedVod = !historical ? getSelectedPreviousVod() : null;
  const liveVodOptions = !historical
    ? state.recentVods.slice(0, 5).map((vod) => `<option value="${escapeHtml(vod.id)}"${vod.id === liveSelectedVod?.id ? ' selected' : ''}>${escapeHtml(formatPreviousVodLabel(vod))}</option>`).join('')
    : '';
  el.streamPanel.innerHTML = `
    <div class="tally">
      <span class="tally__light"></span>
      <span class="tally__label">${historical ? 'PREVIOUS STREAM' : 'ON AIR'}</span>
    </div>
    <h2 class="stream-title">${escapeHtml(s.title)}</h2>
    <p class="stream-game">${escapeHtml(s.game_name || 'All categories · tags-first search')}</p>
    <div class="stat-row">
      <span class="stat-chip"><span class="stat-chip__mono">${fmtNumber(s.viewer_count)}</span> ${historical ? 'viewer baseline' : 'viewers'}</span>
      ${trackerAverage != null ? `<span class="stat-chip" title="30-day channel summary from TwitchTracker"><span class="stat-chip__mono">~${fmtNumber(trackerAverage)}</span> 30-day average</span>` : rollingAverage ? `<span class="stat-chip" title="${escapeHtml(rollingAverage.confidence)} from ${rollingAverage.sessionCount} observed stream session${rollingAverage.sessionCount === 1 ? '' : 's'}"><span class="stat-chip__mono">~${fmtNumber(rollingAverage.average)}</span> 30-day observed average</span>` : ''}
      <span class="stat-chip"><span class="stat-chip__mono">${fmtDuration(Date.now() - new Date(s.started_at).getTime())}</span> ${historical ? 'previous duration' : 'live'}</span>
    </div>
    ${historical
      ? ownStreamMediaHtml({ videoId: selectedVod?.id, title: selectedVod?.title || s.title, isLive: false })
      : ownStreamMediaHtml({ channel: state.user.login, title: s.title, isLive: true })}
    ${!historical && state.recentVods.length ? `
      <details class="live-vod-browser" open>
        <summary>Browse your latest past broadcasts</summary>
        <label class="offline-reference__field-label" for="live-vod-select">Choose a previous stream</label>
        <select id="live-vod-select" class="text-input offline-reference__select">${liveVodOptions}</select>
        ${ownStreamMediaHtml({ videoId: liveSelectedVod?.id, title: liveSelectedVod?.title, isLive: false })}
      </details>` : ''}
    ${historical ? '<button class="btn btn--ghost historical-refresh" id="refresh-historical-btn">Check live status</button>' : ''}`;
  document.getElementById('refresh-historical-btn')?.addEventListener('click', refreshLiveStatus);
  document.getElementById('live-vod-select')?.addEventListener('change', (event) => {
    state.selectedPreviousVodId = event.currentTarget.value;
    renderStreamPanel();
  });
  renderSelectedCategories();
  renderViewerMatchHint();
}

function ownStreamMediaHtml({ channel, videoId, title, isLive }) {
  const playerUrl = buildTwitchPlayerUrl({
    hostname: window.location.hostname,
    channel,
    videoId,
  });
  const watchUrl = buildTwitchWatchUrl({ channel, videoId });
  if (!watchUrl) return '';

  const heading = isLive ? 'Your live stream' : 'Selected previous stream';
  const frameTitle = isLive
    ? `${state.user.display_name} live stream on Twitch`
    : `${title || 'Previous stream'} video on Twitch`;
  const iframe = playerUrl ? `
      <div class="own-stream-media__frame">
        <iframe
          src="${escapeHtml(playerUrl)}"
          title="${escapeHtml(frameTitle)}"
          loading="lazy"
          allow="autoplay; fullscreen"
          allowfullscreen
        ></iframe>
      </div>` : '';

  return `
    <section class="own-stream-media" aria-label="${escapeHtml(heading)}">
      <div class="own-stream-media__header">
        <div>
          <p class="section-eyebrow">${isLive ? 'Live preview' : 'VOD preview'}</p>
          <h3>${escapeHtml(heading)}</h3>
        </div>
        <a class="btn btn--ghost btn--small" href="${escapeHtml(watchUrl)}" target="_blank" rel="noopener noreferrer">
          Open on Twitch
        </a>
      </div>
      ${iframe}
      <p class="own-stream-media__phone-note">Twitch requires a player at least 400 pixels wide. Open this ${isLive ? 'stream' : 'VOD'} on Twitch on this screen size.</p>
      ${playerUrl ? '<p class="own-stream-media__note">Playback is muted and does not start automatically.</p>' : '<p class="own-stream-media__note">The embedded player needs a hosted domain. Use Open on Twitch while previewing locally.</p>'}
    </section>`;
}

function renderViewerMatchHint() {
  const tolerance = getViewerTolerancePercent();
  const baseline = state.myStream ? Number(state.myStream.viewer_count) : null;
  el.viewerToleranceFilter.querySelectorAll('[data-viewer-range-value]').forEach((rangeElement) => {
    const value = rangeElement.dataset.viewerRangeValue;
    const presentation = describeViewerRange(baseline, value);
    rangeElement.textContent = presentation.rangeText;
    const description = el.viewerToleranceFilter.querySelector(`[data-viewer-range-description="${value}"]`);
    if (description) description.textContent = presentation.description;
  });

  if (!state.myStream) {
    el.viewerMatchHint.textContent = el.onlyFollowingFilter.checked
      ? 'Viewer-count matching is ignored while offline in Following Only mode.'
      : tolerance === null
        ? 'Viewer-count matching is currently unlimited.'
        : 'Go live or choose a previous stream to calculate these viewer ranges.';
    return;
  }
  el.viewerMatchHint.textContent = tolerance === null
    ? 'Any audience size is allowed; there is no viewer-count restriction.'
    : `Ranges are based on your ${state.usingPreviousStream ? 'selected previous-stream' : 'current'} audience of ${fmtNumber(Math.round(baseline))} viewers and rounded to whole viewers.`;
}

function formatPreviousVodLabel(vod) {
  const date = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
    new Date(vod.created_at)
  );
  return `${date}: ${vod.title || 'Untitled stream'} (${vod.duration || 'duration unknown'})`;
}

function getSelectedPreviousVod() {
  return state.recentVods.find((vod) => vod.id === state.selectedPreviousVodId)
    ?? state.recentVods[0]
    ?? null;
}

function getPreviousStreamDefaults(vod) {
  const saved = vod?.stream_id ? PreviousStreamHistory.getByStreamId(vod.stream_id) : null;
  const generalAverage = ViewerHistory.getAverage(state.user.id);
  const trackerAverage = state.twitchTrackerSummary?.averageViewers;
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
        ? "Category restored from this stream's locally observed Wormhole data."
        : 'Category restored from your saved correction for this VOD.'
      : category
        ? 'Twitch does not include a category on each VOD. Confirm or change the last-played category shown above.'
        : 'Twitch does not provide the category for this older VOD. Search and select its category above.',
    viewerBaseline: saved?.averageViewers != null
      ? Math.round(saved.averageViewers)
      : trackerAverage != null
        ? Math.round(trackerAverage)
        : generalAverage
          ? Math.round(generalAverage.average)
          : '',
    viewerHint: saved?.averageViewers != null
      ? saved.baselineSource === 'manual'
        ? 'Using the viewer baseline you previously saved for this VOD.'
        : `Calculated from ${saved.sampleCount} sample${saved.sampleCount === 1 ? '' : 's'} saved for this stream.`
      : trackerAverage != null
        ? 'Using your 30-day average from TwitchTracker; edit it if this specific stream differed.'
        : generalAverage
          ? `Using your rolling 30-day Wormhole average from ${generalAverage.sampleCount} observed sample${generalAverage.sampleCount === 1 ? '' : 's'} across ${generalAverage.sessionCount} stream session${generalAverage.sessionCount === 1 ? '' : 's'}; edit it if this stream differed.`
          : "Twitch does not expose past concurrent viewers, so enter the stream's average.",
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
        logger.error(error);
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
  const loadingId = startLoading('Looking up that Twitch channel...');
  state.shortlistedIds.clear();
  state.hiddenResultIds.clear();
  state.matches = [];
  el.resultsPanel.classList.add('hidden');
  el.directStreamerBtn.disabled = true;
  el.directStreamerBtn.textContent = 'Looking up...';
  el.directStreamerStatus.dataset.result = 'true';
  el.directStreamerStatus.textContent = `Looking up ${login}...`;

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

    await attachContentClassificationLabels([stream]);
    if (generation !== directSearchGeneration) return;
    stream.broadcaster_type = profile.broadcaster_type || 'none';
    try {
      const followedIds = await state.api.getFollowedBroadcasterIds(state.user.id);
      if (generation !== directSearchGeneration) return;
      stream.is_followed = followedIds.has(profile.id);
      stream.followed_at = stream.is_followed ? state.api.getFollowedAt(profile.id) : null;
    } catch (error) {
      logger.error(error);
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
    state.resultsSort = 'following-first';
    el.resultsSort.value = 'following-first';
    state.resultsMode = 'direct';
    el.directStreamerStatus.textContent = `Showing ${profile.display_name} without applying match filters.`;
    el.resultsPanel.classList.remove('hidden');
    renderResults();
  } catch (error) {
    if (generation !== directSearchGeneration) return;
    logger.error(error);
    el.directStreamerStatus.textContent = 'Wormhole could not look up that streamer. Try again.';
  } finally {
    finishLoading(loadingId);
    if (generation === directSearchGeneration && state.myStream) {
      el.directStreamerBtn.disabled = false;
      el.directStreamerBtn.textContent = 'Find streamer';
    }
  }
});

el.showFollowedLiveBtn.addEventListener('click', async () => {
  if (!state.api || !state.user) return;

  const generation = ++followedLiveGeneration;
  const loadingId = startLoading('Loading live channels you follow...');
  state.shortlistedIds.clear();
  state.hiddenResultIds.clear();
  invalidateSearch();
  directSearchGeneration += 1;
  if (state.myStream) {
    el.directStreamerBtn.disabled = false;
    el.directStreamerBtn.textContent = 'Find streamer';
  }

  el.showFollowedLiveBtn.disabled = true;
  el.showFollowedLiveBtn.textContent = 'Loading followed channels...';
  el.followedLiveStatus.textContent = 'Loading every followed channel currently live...';
  el.resultsPanel.classList.remove('hidden');
  el.resultsPagination.classList.add('hidden');
  el.resultsList.innerHTML = loadingCardsHtml();
  showSearchStatus('Loading your live followed channels from Twitch...');

  try {
    const streams = await state.api.getFollowedLiveStreams(state.user.id);
    if (generation !== followedLiveGeneration) return;

    await attachContentClassificationLabels(streams);
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
      ? `${fmtNumber(streams.length)} followed channel${streams.length === 1 ? '' : 's'} live now. Match filters were not applied.`
      : 'None of the channels you follow are currently live.';
    renderResults();
  } catch (error) {
    if (generation !== followedLiveGeneration) return;
    logger.error(error);
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
    finishLoading(loadingId);
    if (generation === followedLiveGeneration && state.api) {
      el.showFollowedLiveBtn.disabled = false;
      el.showFollowedLiveBtn.textContent = 'Show all live followed channels';
    }
  }
});

// ---- Utils ---------------------------------------------------------



withLoading('Checking your saved Twitch session...', init);

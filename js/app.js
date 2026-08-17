import { TWITCH_CONFIG } from './config.js';
import { TwitchAuth } from './twitch-auth.js';
import { TwitchApi } from './twitch-api.js';
import { applyHardFilters, findRaidMatches } from './raid-match.js';
import { RaidListener } from './raid-listener.js';
import { ViewerHistory } from './viewer-history.js';
import { PreviousStreamHistory } from './previous-stream-history.js';
import { paginate } from './pagination.js';
import { ChannelHistory } from './channel-history.js';
import { estimateStreamEnd, parseTwitchDuration } from './stream-end-estimate.js';

const state = {
  api: null,
  user: null,
  myStream: null,
  channelInfo: null,
  recentVods: [],
  selectedPreviousVodId: null,
  offlineCategorySelection: null,
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
};

const el = {
  loginView: document.getElementById('login-view'),
  appView: document.getElementById('app-view'),
  loginBtn: document.getElementById('login-btn'),
  loginError: document.getElementById('login-error'),
  logoutBtn: document.getElementById('logout-btn'),
  userName: document.getElementById('user-name'),
  userAvatar: document.getElementById('user-avatar'),
  streamPanel: document.getElementById('stream-panel'),
  findBtn: document.getElementById('find-btn'),
  viewerMatchHint: document.getElementById('viewer-match-hint'),
  showAllViewersFilter: document.getElementById('show-all-viewers-filter'),
  statusFilters: document.getElementById('status-filters'),
  sameTeamFilter: document.getElementById('same-team-filter'),
  teamHint: document.getElementById('team-hint'),
  tagsInput: document.getElementById('tags-input'),
  categorySearchInput: document.getElementById('category-search-input'),
  categorySuggestions: document.getElementById('category-suggestions'),
  selectedCategories: document.getElementById('selected-categories'),
  resultsPanel: document.getElementById('results-panel'),
  resultsList: document.getElementById('results-list'),
  resultsStatus: document.getElementById('results-status'),
  resultsPagination: document.getElementById('results-pagination'),
  resultsPageSize: document.getElementById('results-page-size'),
  resultsPageSummary: document.getElementById('results-page-summary'),
  resultsPrevPage: document.getElementById('results-prev-page'),
  resultsNextPage: document.getElementById('results-next-page'),
  raidDialog: document.getElementById('raid-dialog'),
  raidDialogText: document.getElementById('raid-dialog-text'),
  raidConfirmBtn: document.getElementById('raid-confirm-btn'),
  raidCancelBtn: document.getElementById('raid-cancel-btn'),
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
      'Set your Twitch Client ID in js/config.js before logging in.';
    return;
  }
  try {
    TwitchAuth.redirectToLogin();
  } catch (error) {
    console.error(error);
    el.loginError.textContent =
      'Could not start Twitch login. Check that browser storage is enabled and try again.';
  }
});

el.logoutBtn.addEventListener('click', async () => {
  searchGeneration += 1;
  await TwitchAuth.logout();
  state.raidListener?.stop();
  state.raidListener = null;
  state.api = null;
  state.user = null;
  state.myStream = null;
  state.matches = [];
  showView('login');
});

async function loadCurrentUser() {
  state.user = await state.api.getCurrentUser();
  const [streamResult, teamsResult, channelResult, vodResult] = await Promise.allSettled([
    state.api.getLiveStreamForUser(state.user.id),
    state.api.getChannelTeams(state.user.id),
    state.api.getChannelInformation(state.user.id),
    state.api.getRecentArchives(state.user.id, { maxResults: 5 }),
  ]);
  if (streamResult.status === 'rejected') throw streamResult.reason;
  state.myStream = streamResult.value;
  state.myTeams = teamsResult.status === 'fulfilled' ? teamsResult.value : [];
  state.channelInfo = channelResult.status === 'fulfilled' ? channelResult.value : null;
  state.recentVods = vodResult.status === 'fulfilled' ? vodResult.value : [];
  state.selectedPreviousVodId = state.recentVods[0]?.id ?? null;
  state.usingPreviousStream = false;
  if (state.myStream) PreviousStreamHistory.record(state.myStream);
  renderUser();
  renderStreamPanel();
  renderViewerMatchHint();
  renderTeamHint();
  startRaidListener();
  showView('app');
}

function startRaidListener() {
  state.raidListener?.stop();
  state.raidListener = new RaidListener(state.api, state.user.id, {
    onRaidSent: (event) => {
      showToast(`Raid completed to ${event.to_broadcaster_user_name}!`);
    },
  });
  state.raidListener.start();
}

async function init() {
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

  const valid = await TwitchAuth.isTokenValid(token);
  if (!valid) {
    await TwitchAuth.logout();
    showView('login');
    return;
  }

  state.api = new TwitchApi(token);
  try {
    await loadCurrentUser();
  } catch (e) {
    console.error(e);
    el.loginError.textContent = 'Could not load your Twitch profile. Try logging in again.';
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
    state.usingPreviousStream = false;
    if (state.myStream) PreviousStreamHistory.record(state.myStream);
    renderStreamPanel();
  } catch (error) {
    console.error(error);
    showToast('Could not refresh your Twitch stream. Please try again.', true);
  }
}

function renderStreamPanel() {
  const s = state.myStream;
  if (!s) {
    const selectedVod = getSelectedPreviousVod();
    const defaults = getPreviousStreamDefaults(selectedVod);
    state.offlineCategorySelection = defaults.category;
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
      if (!state.offlineCategorySelection?.id) {
        showToast('Choose the category used for that stream.', true);
        document.getElementById('offline-category-input').focus();
        return;
      }
      const selectedVod = getSelectedPreviousVod();
      if (selectedVod?.stream_id) {
        PreviousStreamHistory.saveReference({
          streamId: selectedVod.stream_id,
          userId: state.user.id,
          title: selectedVod.title,
          gameId: state.offlineCategorySelection.id,
          gameName: state.offlineCategorySelection.name,
          startedAt: selectedVod.created_at,
          viewerBaseline: viewerCount,
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
    renderViewerMatchHint();
    renderSelectedCategories();
    return;
  }

  el.findBtn.disabled = false;
  const historical = state.usingPreviousStream;
  el.streamPanel.innerHTML = `
    <div class="tally">
      <span class="tally__light"></span>
      <span class="tally__label">${historical ? 'PREVIOUS STREAM' : 'ON AIR'}</span>
    </div>
    <h2 class="stream-title">${escapeHtml(s.title)}</h2>
    <p class="stream-game">${escapeHtml(s.game_name)}</p>
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
  if (!state.myStream) {
    el.viewerMatchHint.textContent = 'Go live or choose your previous stream to calculate a ±50% viewer range.';
    return;
  }
  const viewers = state.myStream.viewer_count;
  const min = Math.max(0, Math.floor(viewers * 0.5));
  const max = Math.ceil(viewers * 1.5);
  const source = state.usingPreviousStream ? 'previous-stream baseline' : `your ${fmtNumber(viewers)}`;
  el.viewerMatchHint.textContent = el.showAllViewersFilter.checked
    ? 'Showing channels regardless of viewer count.'
    : `Default match: ${fmtNumber(min)}–${fmtNumber(max)} viewers (±50% of ${source}).`;
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
  const category = saved?.gameId
    ? { id: saved.gameId, name: saved.gameName, source: 'saved' }
    : isLatestVod && state.channelInfo?.game_id
      ? { id: state.channelInfo.game_id, name: state.channelInfo.game_name, source: 'last-played' }
      : null;

  return {
    category,
    categoryHint: saved?.gameId
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
  if (!input || !suggestions) return;

  const hideSuggestions = () => suggestions.classList.add('hidden');
  const chooseCategory = (category) => {
    state.offlineCategorySelection = category;
    input.value = category.name;
    hint.textContent = `Using ${category.name} for this previous stream.`;
    hideSuggestions();
  };

  input.addEventListener('input', () => {
    clearTimeout(offlineCategorySearchDebounce);
    state.offlineCategorySelection = null;
    hint.textContent = 'Select a Twitch category from the suggestions.';
    const query = input.value.trim();
    if (!query) {
      hideSuggestions();
      return;
    }
    offlineCategorySearchDebounce = setTimeout(async () => {
      try {
        const results = await state.api.searchCategories(query, { maxResults: 8 });
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
    game_id: category.id,
    game_name: category.name,
    title: vod?.title || saved?.title || state.channelInfo?.title || 'Previous stream',
    viewer_count: viewerCount,
    started_at: new Date(Date.now() - durationMs).toISOString(),
    tags: [],
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

// Re-run the search automatically when a filter changes, but only if
// results are already showing — no point searching before the first click.
function rerunIfResultsVisible() {
  if (!el.resultsPanel.classList.contains('hidden')) runSearch();
}

el.showAllViewersFilter.addEventListener('change', () => {
  renderViewerMatchHint();
  rerunIfResultsVisible();
});
el.statusFilters.addEventListener('change', rerunIfResultsVisible);
el.sameTeamFilter.addEventListener('change', rerunIfResultsVisible);
el.tagsInput.addEventListener('change', rerunIfResultsVisible);

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

// ---- Category search (Twitch's category database, IGDB-backed) --------
//
// IGDB's own API can't be called from a browser: it has no CORS support
// and its auth needs a client secret that can't safely live in front-end
// code. Twitch's /search/categories endpoint covers the same underlying
// database (Twitch owns IGDB) and works with the token we already have —
// so that's what powers "search other games/categories" here.

let categorySearchDebounce = null;

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
  try {
    const results = await state.api.searchCategories(query, { maxResults: 8 });
    renderCategorySuggestions(results);
  } catch (e) {
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
  state.extraCategories.push(category);
  renderSelectedCategories();
  rerunIfResultsVisible();
}

function removeCategory(id) {
  state.extraCategories = state.extraCategories.filter((c) => c.id !== id);
  renderSelectedCategories();
  rerunIfResultsVisible();
}

function renderSelectedCategories() {
  const primary = state.myStream
    ? `<span class="category-chip category-chip--locked" title="Your current category is always included">${escapeHtml(state.myStream.game_name)}</span>`
    : '';

  const extra = state.extraCategories
    .map(
      (c) => `
      <span class="category-chip">
        ${escapeHtml(c.name)}
        <button type="button" class="category-chip__remove" data-remove-id="${escapeHtml(c.id)}" aria-label="Remove ${escapeHtml(c.name)}">×</button>
      </span>`
    )
    .join('');

  el.selectedCategories.innerHTML = primary + extra;

  el.selectedCategories.querySelectorAll('[data-remove-id]').forEach((btn) => {
    btn.addEventListener('click', () => removeCategory(btn.dataset.removeId));
  });
}

let searchGeneration = 0;
let resultsRenderGeneration = 0;

async function runSearch() {
  if (!state.myStream) return;
  if (!state.usingPreviousStream) PreviousStreamHistory.record(state.myStream);

  const generation = ++searchGeneration;

  const selectedStatuses = getSelectedStatuses();
  const wantsSameTeam = el.sameTeamFilter.checked && !el.sameTeamFilter.disabled;
  const showAllViewerCounts = el.showAllViewersFilter.checked;
  const tags = getTagsQuery();

  el.findBtn.disabled = true;

  el.resultsPanel.classList.remove('hidden');
  el.resultsList.innerHTML = '';
  el.resultsStatus.textContent = 'Scanning the category…';
  el.resultsStatus.classList.remove('hidden');

  try {
    const gameIds = [state.myStream.game_id, ...state.extraCategories.map((c) => c.id)];

    const minimumMatchedViewers = showAllViewerCounts
      ? null
      : Math.max(0, Math.floor(state.myStream.viewer_count * 0.5));
    const candidateLists = await Promise.all(
      gameIds.map((id) => state.api.getLiveStreamsByGame(id, {
        maxResults: showAllViewerCounts ? 500 : 1000,
        stopBelowViewers: minimumMatchedViewers,
      }))
    );
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

    el.resultsStatus.textContent = 'Scanning the category…';

    // broadcaster_type isn't on /streams — look it up in one batched call
    // and attach it to each candidate before filtering/scoring.
    const broadcasterTypes = await state.api.getBroadcasterTypes(
      candidates.map((s) => s.user_id)
    );
    if (generation !== searchGeneration) return;
    for (const s of candidates) {
      s.broadcaster_type = broadcasterTypes.get(s.user_id) ?? 'none';
    }

    // Follow status annotates results; it never expands or filters the
    // candidate pool. If the optional lookup fails, matching continues.
    el.resultsStatus.textContent = 'Checking channels you follow…';
    try {
      const followedIds = await state.api.getFollowedBroadcasterIds(state.user.id);
      if (generation !== searchGeneration) return;
      for (const s of candidates) {
        s.is_followed = followedIds.has(s.user_id);
        s.followed_at = s.is_followed ? state.api.getFollowedAt(s.user_id) : null;
      }
    } catch (e) {
      console.error(e);
      for (const s of candidates) s.is_followed = false;
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
      el.resultsStatus.textContent = 'Checking team rosters…';

      const preFiltered = applyHardFilters(candidates, {
        allowedBroadcasterTypes: selectedStatuses,
        requiredTags: tags,
      });

      const myTeamIds = new Set(state.myTeams.map((t) => t.id));
      const memberships = await state.api.getTeamMembershipsForUsers(
        preFiltered.map((s) => s.user_id)
      );
      if (generation !== searchGeneration) return;

      for (const s of preFiltered) {
        const teams = memberships.get(s.user_id) ?? [];
        s.shared_team_names = teams
          .filter((t) => myTeamIds.has(t.id))
          .map((t) => t.team_display_name || t.team_name);
      }
    }

    state.matches = findRaidMatches(state.myStream, candidates, {
      viewerTolerancePercent: 50,
      ignoreViewerTolerance: showAllViewerCounts,
      allowedBroadcasterTypes: selectedStatuses,
      requireSharedTeam: wantsSameTeam,
      requiredTags: tags,
    });
    state.resultsPage = 1;
    renderResults();
  } catch (e) {
    if (generation !== searchGeneration) return;
    console.error(e);
    el.resultsStatus.textContent = 'Could not fetch raid matches. Please try again in a moment.';
  } finally {
    if (generation === searchGeneration && state.myStream) el.findBtn.disabled = false;
  }
}

function scoreClass(score) {
  if (score >= 80) return 'score--high';
  if (score >= 55) return 'score--mid';
  return 'score--low';
}

function renderResults() {
  const renderGeneration = ++resultsRenderGeneration;
  if (!state.matches.length) {
    el.resultsStatus.textContent =
      'No matches found. Try showing all viewer counts or loosening the tags and other filters.';
    el.resultsStatus.classList.remove('hidden');
    el.resultsPagination.classList.add('hidden');
    el.resultsList.innerHTML = '';
    return;
  }

  el.resultsStatus.classList.add('hidden');
  const page = paginate(state.matches, state.resultsPage, state.resultsPageSize);
  state.resultsPage = page.page;
  state.resultsPageSize = page.pageSize;
  el.resultsPageSize.value = String(page.pageSize);
  el.resultsPageSummary.textContent =
    `Showing ${page.startIndex + 1}–${page.endIndex} of ${state.matches.length} · Page ${page.page} of ${page.pageCount}`;
  el.resultsPrevPage.disabled = page.page === 1;
  el.resultsNextPage.disabled = page.page === page.pageCount;
  el.resultsPagination.classList.remove('hidden');

  el.resultsList.innerHTML = page.items
    .map((m, i) => resultCardHtml(m, page.startIndex + i + 1))
    .join('');

  loadFollowerCountsForVisiblePage(page.items, renderGeneration);

  el.resultsList.querySelectorAll('[data-raid-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.raidIndex);
      openRaidDialog(state.matches[idx]);
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

  const expandedMatch = page.items.find(
    (match) => match.stream.user_id === state.expandedActivityId
  );
  if (expandedMatch) loadRecentActivity(expandedMatch.stream, renderGeneration);
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

async function loadRecentActivity(stream, renderGeneration) {
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
    stream, videos, clips, scheduleContext, profile, history,
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

function recentActivityHtml({ stream, videos, clips, scheduleContext, profile, history }) {
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
  const scorePct = Math.round(match.matchScore);
  // Analog meter needle: -90deg (0%) to +90deg (100%).
  const needleDeg = -90 + (scorePct / 100) * 180;
  const statusLabel = STATUS_LABELS[s.broadcaster_type ?? 'none'];
  const raidButton = state.usingPreviousStream
    ? '<button class="btn btn--outline" disabled title="You must be live to start a raid">Go live to raid</button>'
    : `<button class="btn btn--outline" data-raid-index="${rank - 1}">Raid this channel</button>`;
  const previewButton = state.expandedWatchId === s.user_id
    ? `<button class="btn btn--ghost" type="button" data-watch-id="${escapeHtml(s.user_id)}">Close preview</button>`
    : `<button class="btn btn--ghost" type="button" data-watch-id="${escapeHtml(s.user_id)}">Preview stream</button>`;
  const activityExpanded = state.expandedActivityId === s.user_id;
  const activityButton = `<button class="btn btn--ghost result-card__activity-button" type="button" data-activity-id="${escapeHtml(s.user_id)}" aria-expanded="${activityExpanded}">${activityExpanded ? 'Close recent activity' : 'Recent activity'}</button>`;
  const followingText = s.followed_at
    ? `Following since ${fmtDate(s.followed_at, { month: 'short', year: 'numeric' })}`
    : 'Following';

  return `
    <li class="result-card">
      <div class="result-card__header">
        <span class="result-card__rank">${rank}</span>
        <span class="result-card__name">${escapeHtml(s.user_name)}</span>
        <div class="meter ${scoreClass(scorePct)}" title="${scorePct}% match">
          <div class="meter__arc"></div>
          <div class="meter__needle" style="transform: rotate(${needleDeg}deg)"></div>
          <div class="meter__value">${scorePct}</div>
        </div>
      </div>
      ${watchMediaHtml(s)}
      <p class="result-card__title">${escapeHtml(s.title)}</p>
      <p class="result-card__game">${escapeHtml(s.game_name)} · <span class="status-tag status-tag--${s.broadcaster_type ?? 'none'}">${statusLabel}</span>${s.is_followed ? ` · <span class="following-tag">${escapeHtml(followingText)}</span>` : ''}${s.shared_team_names?.length ? ` · <span class="team-tag">${escapeHtml(s.shared_team_names[0])}</span>` : ''}</p>
      ${contentLabelsHtml(s)}
      <div class="stat-row">
        <span class="stat-chip"><span class="stat-chip__mono">${fmtNumber(s.viewer_count)}</span> live</span>
        <span class="stat-chip"><span class="stat-chip__mono">~${fmtNumber(match.estimatedAverageViewers)}</span> avg${match.averageIsHistorical ? '' : ' (est.)'}</span>
        <span class="stat-chip"><span class="stat-chip__mono">${fmtDuration(Date.now() - new Date(s.started_at).getTime())}</span> live</span>
        <span class="stat-chip" data-follower-id="${escapeHtml(s.user_id)}">Loading followers…</span>
      </div>
      <div class="result-card__actions">
        <a class="watch-link" href="https://twitch.tv/${escapeHtml(s.user_login)}" target="_blank" rel="noopener noreferrer">Open on Twitch ↗</a>
      </div>
      ${activityButton}
      ${activityExpanded ? `<section class="recent-activity" data-activity-panel="${escapeHtml(s.user_id)}" aria-label="Recent activity for ${escapeHtml(s.user_name)}"><p class="activity-empty">Loading recent activity…</p></section>` : ''}
      <div class="result-card__buttons">
        ${previewButton}
        ${raidButton}
      </div>
    </li>`;
}

// ---- Raid confirm dialog -----------------------------------------------

let pendingRaid = null;

function openRaidDialog(match) {
  pendingRaid = match;
  el.raidDialogText.textContent = `Raid ${match.stream.user_name} with your viewers right now?`;
  el.raidDialog.showModal();
}

el.raidCancelBtn.addEventListener('click', () => {
  pendingRaid = null;
  el.raidDialog.close();
});

el.raidConfirmBtn.addEventListener('click', async () => {
  if (!pendingRaid) return;
  const target = pendingRaid;
  el.raidDialog.close();
  try {
    await state.api.startRaid(state.user.id, target.stream.user_id);
    showToast(`Raid countdown started for ${target.stream.user_name}.`);
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

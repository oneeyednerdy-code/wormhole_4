import { TWITCH_CONFIG } from './config.js';
import { TwitchAuth } from './twitch-auth.js';
import { TwitchApi } from './twitch-api.js';
import { applyHardFilters, findRaidMatches } from './raid-match.js';

const state = {
  api: null,
  user: null,
  myStream: null,
  myTeams: [], // Twitch Teams the logged-in user belongs to
  matches: [],
  tolerance: 60,
  extraCategories: [], // additional {id, name} categories to include, beyond myStream's own game
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
  toleranceSlider: document.getElementById('tolerance-slider'),
  toleranceValue: document.getElementById('tolerance-value'),
  viewerRangeMin: document.getElementById('viewer-range-min'),
  viewerRangeMax: document.getElementById('viewer-range-max'),
  viewerRangeFill: document.getElementById('viewer-range-fill'),
  viewerRangeMinLabel: document.getElementById('viewer-range-min-label'),
  viewerRangeMaxLabel: document.getElementById('viewer-range-max-label'),
  statusFilters: document.getElementById('status-filters'),
  sameTeamFilter: document.getElementById('same-team-filter'),
  teamHint: document.getElementById('team-hint'),
  categorySearchInput: document.getElementById('category-search-input'),
  categorySuggestions: document.getElementById('category-suggestions'),
  selectedCategories: document.getElementById('selected-categories'),
  resultsPanel: document.getElementById('results-panel'),
  resultsList: document.getElementById('results-list'),
  resultsStatus: document.getElementById('results-status'),
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

function fmtNumber(n) {
  return new Intl.NumberFormat().format(Math.round(n));
}

function fmtDuration(ms) {
  const totalMinutes = Math.floor(ms / 1000 / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
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
  TwitchAuth.redirectToLogin();
});

el.logoutBtn.addEventListener('click', async () => {
  await TwitchAuth.logout();
  state.api = null;
  state.user = null;
  state.myStream = null;
  state.matches = [];
  showView('login');
});

async function loadCurrentUser() {
  state.user = await state.api.getCurrentUser();
  state.myStream = await state.api.getLiveStreamForUser(state.user.id);
  state.myTeams = await state.api.getChannelTeams(state.user.id);
  renderUser();
  renderStreamPanel();
  renderTeamHint();
  showView('app');
}

async function init() {
  const capturedToken = TwitchAuth.captureRedirectToken();
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

function renderStreamPanel() {
  const s = state.myStream;
  if (!s) {
    el.streamPanel.innerHTML = `
      <div class="offline-card">
        <div class="offline-card__dot"></div>
        <p class="offline-card__title">You're not live right now.</p>
        <p class="offline-card__hint">Go live on Twitch, then refresh to load your stream stats.</p>
        <button class="btn btn--ghost" id="refresh-stream-btn">Refresh</button>
      </div>`;
    document.getElementById('refresh-stream-btn').addEventListener('click', async () => {
      state.myStream = await state.api.getLiveStreamForUser(state.user.id);
      renderStreamPanel();
    });
    el.findBtn.disabled = true;
    renderSelectedCategories();
    return;
  }

  el.findBtn.disabled = false;
  el.streamPanel.innerHTML = `
    <div class="tally">
      <span class="tally__light"></span>
      <span class="tally__label">ON AIR</span>
    </div>
    <h2 class="stream-title">${escapeHtml(s.title)}</h2>
    <p class="stream-game">${escapeHtml(s.game_name)}</p>
    <div class="stat-row">
      <span class="stat-chip"><span class="stat-chip__mono">${fmtNumber(s.viewer_count)}</span> viewers</span>
      <span class="stat-chip"><span class="stat-chip__mono">${fmtDuration(Date.now() - new Date(s.started_at).getTime())}</span> live</span>
    </div>`;
  renderSelectedCategories();
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

el.toleranceSlider.addEventListener('input', () => {
  state.tolerance = Number(el.toleranceSlider.value);
  el.toleranceValue.textContent = `${state.tolerance}%`;
});

el.findBtn.addEventListener('click', () => runSearch());

// Re-run the search automatically when a filter changes, but only if
// results are already showing — no point searching before the first click.
function rerunIfResultsVisible() {
  if (!el.resultsPanel.classList.contains('hidden')) runSearch();
}

el.toleranceSlider.addEventListener('change', rerunIfResultsVisible);
el.statusFilters.addEventListener('change', rerunIfResultsVisible);
el.sameTeamFilter.addEventListener('change', rerunIfResultsVisible);

function getSelectedStatuses() {
  return [...el.statusFilters.querySelectorAll('input[type="checkbox"]')]
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
}

// ---- Viewer-count dual-range slider ------------------------------------
//
// Twitch viewer counts span orders of magnitude (a handful up to tens of
// thousands), so a linear slider would waste most of its range on numbers
// nobody uses. Internally the sliders move 0-1000; that position is mapped
// onto viewer counts on a log curve, and the max handle's top position
// means "no upper limit" rather than a specific number.

const SLIDER_STEPS = 1000;
const SLIDER_LOG_CEILING = 100000; // viewer count at ~99% up the slider

function posToViewers(pos) {
  if (pos <= 0) return 0;
  const ratio = pos / SLIDER_STEPS;
  return Math.round(Math.exp(Math.log(SLIDER_LOG_CEILING) * ratio));
}

function renderViewerRange() {
  let minPos = Number(el.viewerRangeMin.value);
  let maxPos = Number(el.viewerRangeMax.value);

  // Keep the handles from crossing.
  if (minPos > maxPos) {
    [minPos, maxPos] = [maxPos, minPos];
    el.viewerRangeMin.value = minPos;
    el.viewerRangeMax.value = maxPos;
  }

  const minPct = (minPos / SLIDER_STEPS) * 100;
  const maxPct = (maxPos / SLIDER_STEPS) * 100;
  el.viewerRangeFill.style.left = `${minPct}%`;
  el.viewerRangeFill.style.width = `${Math.max(0, maxPct - minPct)}%`;

  const minViewers = posToViewers(minPos);
  el.viewerRangeMinLabel.textContent = fmtNumber(minViewers);
  el.viewerRangeMaxLabel.textContent =
    maxPos >= SLIDER_STEPS ? 'No limit' : fmtNumber(posToViewers(maxPos));
}

function getViewerBounds() {
  const minPos = Number(el.viewerRangeMin.value);
  const maxPos = Number(el.viewerRangeMax.value);
  const min = minPos <= 0 ? null : posToViewers(minPos);
  const max = maxPos >= SLIDER_STEPS ? null : posToViewers(maxPos);
  return { min, max };
}

el.viewerRangeMin.addEventListener('input', renderViewerRange);
el.viewerRangeMax.addEventListener('input', renderViewerRange);
el.viewerRangeMin.addEventListener('change', rerunIfResultsVisible);
el.viewerRangeMax.addEventListener('change', rerunIfResultsVisible);
renderViewerRange();

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
      item.addEventListener('mousedown', () => {
        addCategory({ id: item.dataset.id, name: item.dataset.name });
        el.categorySearchInput.value = '';
        hideCategorySuggestions();
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

async function runSearch() {
  if (!state.myStream) return;

  const selectedStatuses = getSelectedStatuses();
  if (selectedStatuses.length === 0) {
    el.resultsPanel.classList.remove('hidden');
    el.resultsList.innerHTML = '';
    el.resultsStatus.textContent = 'Select at least one channel status above to search.';
    el.resultsStatus.classList.remove('hidden');
    return;
  }

  const wantsSameTeam = el.sameTeamFilter.checked && !el.sameTeamFilter.disabled;

  el.resultsPanel.classList.remove('hidden');
  el.resultsList.innerHTML = '';
  el.resultsStatus.textContent = 'Scanning the category…';
  el.resultsStatus.classList.remove('hidden');

  try {
    const gameIds = [state.myStream.game_id, ...state.extraCategories.map((c) => c.id)];

    const candidateLists = await Promise.all(
      gameIds.map((id) => state.api.getLiveStreamsByGame(id, { maxResults: 100 }))
    );
    // Dedupe in case a channel somehow shows up under two selected
    // categories (shouldn't normally happen — a stream has one game_id
    // at a time — but keeps the list honest either way).
    const seen = new Set();
    const candidates = candidateLists.flat().filter((s) => {
      if (seen.has(s.user_id)) return false;
      seen.add(s.user_id);
      return true;
    });

    // broadcaster_type isn't on /streams — look it up in one batched call
    // and attach it to each candidate before filtering/scoring.
    const broadcasterTypes = await state.api.getBroadcasterTypes(
      candidates.map((s) => s.user_id)
    );
    for (const s of candidates) {
      s.broadcaster_type = broadcasterTypes.get(s.user_id) ?? 'none';
    }

    const { min, max } = getViewerBounds();

    // Team membership has no batch endpoint (one request per channel), so
    // only fetch it for candidates that already survive the cheap filters
    // — narrowing the list first keeps this from firing 100 requests when
    // most of them would've been filtered out anyway.
    if (wantsSameTeam) {
      el.resultsStatus.textContent = 'Checking team rosters…';

      const preFiltered = applyHardFilters(candidates, {
        minViewers: min,
        maxViewers: max,
        allowedBroadcasterTypes: selectedStatuses,
      });

      const myTeamIds = new Set(state.myTeams.map((t) => t.id));
      const memberships = await state.api.getTeamMembershipsForUsers(
        preFiltered.map((s) => s.user_id)
      );

      for (const s of preFiltered) {
        const teams = memberships.get(s.user_id) ?? [];
        s.shared_team_names = teams
          .filter((t) => myTeamIds.has(t.id))
          .map((t) => t.team_display_name || t.team_name);
      }
    }

    state.matches = findRaidMatches(state.myStream, candidates, {
      viewerTolerancePercent: state.tolerance,
      minViewers: min,
      maxViewers: max,
      allowedBroadcasterTypes: selectedStatuses,
      requireSharedTeam: wantsSameTeam,
    });
    renderResults();
  } catch (e) {
    console.error(e);
    el.resultsStatus.textContent = `Could not fetch raid matches: ${e.message}`;
  }
}

function scoreClass(score) {
  if (score >= 80) return 'score--high';
  if (score >= 55) return 'score--mid';
  return 'score--low';
}

function renderResults() {
  if (!state.matches.length) {
    el.resultsStatus.textContent =
      'No matches found. Try widening the tolerance, viewer range, channel status, or team filters above.';
    el.resultsStatus.classList.remove('hidden');
    el.resultsList.innerHTML = '';
    return;
  }

  el.resultsStatus.classList.add('hidden');
  el.resultsList.innerHTML = state.matches
    .map((m, i) => resultCardHtml(m, i + 1))
    .join('');

  el.resultsList.querySelectorAll('[data-raid-index]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.dataset.raidIndex);
      openRaidDialog(state.matches[idx]);
    });
  });
}

function resultCardHtml(match, rank) {
  const s = match.stream;
  const scorePct = Math.round(match.matchScore);
  // Analog meter needle: -90deg (0%) to +90deg (100%).
  const needleDeg = -90 + (scorePct / 100) * 180;
  const statusLabel = STATUS_LABELS[s.broadcaster_type ?? 'none'];

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
      <p class="result-card__title">${escapeHtml(s.title)}</p>
      <p class="result-card__game">${escapeHtml(s.game_name)} · <span class="status-tag status-tag--${s.broadcaster_type ?? 'none'}">${statusLabel}</span>${s.shared_team_names?.length ? ` · <span class="team-tag">${escapeHtml(s.shared_team_names[0])}</span>` : ''}</p>
      <div class="stat-row">
        <span class="stat-chip"><span class="stat-chip__mono">${fmtNumber(s.viewer_count)}</span> live</span>
        <span class="stat-chip"><span class="stat-chip__mono">~${fmtNumber(match.estimatedAverageViewers)}</span> avg${match.averageIsHistorical ? '' : ' (est.)'}</span>
        <span class="stat-chip"><span class="stat-chip__mono">${fmtDuration(Date.now() - new Date(s.started_at).getTime())}</span> live</span>
      </div>
      <button class="btn btn--outline" data-raid-index="${rank - 1}">Raid this channel</button>
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
    showToast(`Raid started on ${target.stream.user_name}!`);
  } catch (e) {
    console.error(e);
    showToast(`Could not start raid: ${e.message}`, true);
  }
  pendingRaid = null;
});

// ---- Utils ---------------------------------------------------------

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

init();

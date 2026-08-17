import { TWITCH_CONFIG } from './config.js';
import { TwitchAuth } from './twitch-auth.js';
import { TwitchApi } from './twitch-api.js';
import { applyHardFilters, findRaidMatches } from './raid-match.js';
import { RaidHistory } from './raid-history.js';
import { RaidListener } from './raid-listener.js';

const state = {
  api: null,
  user: null,
  myStream: null,
  myTeams: [], // Twitch Teams the logged-in user belongs to
  matches: [],
  extraCategories: [], // additional {id, name} categories to include, beyond myStream's own game
  expandedWatchId: null, // user_id of the result card currently showing a live embed, if any
  raidListener: null,
  raidListenerStatus: 'disconnected',
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
  followingFilter: document.getElementById('following-filter'),
  followingHint: document.getElementById('following-hint'),
  recentRaidersFilter: document.getElementById('recent-raiders-filter'),
  recentRaidersHint: document.getElementById('recent-raiders-hint'),
  tagsInput: document.getElementById('tags-input'),
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
  state.myStream = await state.api.getLiveStreamForUser(state.user.id);
  try {
    state.myTeams = await state.api.getChannelTeams(state.user.id);
  } catch (error) {
    console.error('Could not load Twitch teams:', error);
    state.myTeams = [];
  }
  renderUser();
  renderStreamPanel();
  renderViewerMatchHint();
  renderTeamHint();
  renderFollowingHint();
  renderRecentRaidersHint();
  startRaidListener();
  showView('app');
}

function startRaidListener() {
  state.raidListener?.stop();
  state.raidListener = new RaidListener(state.api, state.user.id, {
    onRaid: (event) => {
      showToast(`${event.from_broadcaster_user_name} just raided you with ${event.viewers} viewers!`);
      renderRecentRaidersHint();
    },
    onRaidSent: (event) => {
      showToast(`Raid completed to ${event.to_broadcaster_user_name}!`);
    },
    onStatusChange: (status) => {
      state.raidListenerStatus = status;
      renderRecentRaidersHint();
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
      try {
        state.myStream = await state.api.getLiveStreamForUser(state.user.id);
        renderStreamPanel();
      } catch (error) {
        console.error(error);
        showToast('Could not refresh your Twitch stream. Please try again.', true);
      }
    });
    el.findBtn.disabled = true;
    renderViewerMatchHint();
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
  renderViewerMatchHint();
}

function renderViewerMatchHint() {
  if (!state.myStream) {
    el.viewerMatchHint.textContent = 'Go live to calculate your ±50% viewer range.';
    return;
  }
  const viewers = state.myStream.viewer_count;
  const min = Math.max(0, Math.floor(viewers * 0.5));
  const max = Math.ceil(viewers * 1.5);
  el.viewerMatchHint.textContent = el.showAllViewersFilter.checked
    ? 'Showing channels regardless of viewer count.'
    : `Default match: ${fmtNumber(min)}–${fmtNumber(max)} viewers (±50% of your ${fmtNumber(viewers)}).`;
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

function renderFollowingHint() {
  el.followingHint.textContent =
    'Adds live channels you follow into the search, regardless of category.';
}

const RAID_LISTENER_STATUS_TEXT = {
  disconnected: 'not connected',
  connecting: 'connecting…',
  connected: 'listening live',
  error: 'connection issue',
};

function renderRecentRaidersHint() {
  const count = RaidHistory.uniqueBroadcasterIds(state.user?.id).length;
  const statusClass = `raid-listener-status--${state.raidListenerStatus}`;
  const statusText = RAID_LISTENER_STATUS_TEXT[state.raidListenerStatus] ?? state.raidListenerStatus;
  const statusBadge = `<span class="raid-listener-status ${statusClass}"><span class="raid-listener-status__dot"></span>${statusText}</span>`;

  if (count === 0) {
    el.recentRaidersHint.innerHTML =
      `No raids recorded yet — Wormhole can only see raids that happen while it's open (Twitch has no history API for this), so this fills in as you keep it open during and after your streams. ${statusBadge}`;
    el.recentRaidersFilter.disabled = true;
    el.recentRaidersFilter.checked = false;
  } else {
    el.recentRaidersHint.innerHTML =
      `${count} recent raider${count === 1 ? '' : 's'} recorded. ${statusBadge}`;
    el.recentRaidersFilter.disabled = false;
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
el.followingFilter.addEventListener('change', rerunIfResultsVisible);
el.recentRaidersFilter.addEventListener('change', rerunIfResultsVisible);
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

async function runSearch() {
  if (!state.myStream) return;

  const generation = ++searchGeneration;

  const selectedStatuses = getSelectedStatuses();
  const wantsSameTeam = el.sameTeamFilter.checked && !el.sameTeamFilter.disabled;
  const wantsFollowing = el.followingFilter.checked;
  const wantsRecentRaiders = el.recentRaidersFilter.checked && !el.recentRaidersFilter.disabled;
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

    if (wantsFollowing) {
      el.resultsStatus.textContent = 'Checking who you follow…';
      try {
        const followingLive = await state.api.getFollowedLiveStreams(state.user.id, {
          maxResults: 100,
        });
        addCandidates(followingLive);
      } catch (e) {
        console.error(e);
        showToast(
          'Could not load followed channels — you may need to log out and back in to grant the new permission.',
          true
        );
      }
    }

    if (wantsRecentRaiders) {
      const raiderIds = RaidHistory.uniqueBroadcasterIds(state.user.id);
      if (raiderIds.length) {
        el.resultsStatus.textContent = 'Checking who raided you…';
        const raiderStreams = await state.api.getStreamsByUserIds(raiderIds);
        addCandidates(raiderStreams);
      }
    }

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
  if (!state.matches.length) {
    el.resultsStatus.textContent =
      'No matches found. Try showing all viewer counts or loosening the tags and other filters.';
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
      <p class="result-card__game">${escapeHtml(s.game_name)} · <span class="status-tag status-tag--${s.broadcaster_type ?? 'none'}">${statusLabel}</span>${s.shared_team_names?.length ? ` · <span class="team-tag">${escapeHtml(s.shared_team_names[0])}</span>` : ''}</p>
      <div class="stat-row">
        <span class="stat-chip"><span class="stat-chip__mono">${fmtNumber(s.viewer_count)}</span> live</span>
        <span class="stat-chip"><span class="stat-chip__mono">~${fmtNumber(match.estimatedAverageViewers)}</span> avg${match.averageIsHistorical ? '' : ' (est.)'}</span>
        <span class="stat-chip"><span class="stat-chip__mono">${fmtDuration(Date.now() - new Date(s.started_at).getTime())}</span> live</span>
      </div>
      <div class="result-card__actions">
        <a class="watch-link" href="https://twitch.tv/${escapeHtml(s.user_login)}" target="_blank" rel="noopener noreferrer">Open on Twitch ↗</a>
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

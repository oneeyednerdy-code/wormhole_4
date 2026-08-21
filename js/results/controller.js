import { state } from '../app/state.js?v=90';
import { el } from '../app/elements.js?v=90';
import { escapeHtml, fmtDate, fmtDuration, fmtNumber } from '../app/format.js?v=90';
import { paginate } from '../pagination.js?v=90';
import { sortRaidMatches } from '../result-sort.js?v=90';
import { getSearchedTagMatch, normalizeTagKey, prepareTagDisplay } from '../tag-display.js?v=90';
import { ChannelHistory } from '../channel-history.js?v=90';
import { loadCreatorDetails } from '../services/creator-details.js?v=90';
import { recentActivityHtml } from './recent-activity.js?v=90';
import { startLoading, finishLoading } from '../loading-state.js?v=90';

const STATUS_LABELS = { partner: 'Partner', affiliate: 'Affiliate', none: 'Non-affiliate' };
const CONTENT_LABELS = {
  DebatedSocialIssuesAndPolitics: 'Politics and sensitive social issues',
  DrugsIntoxication: 'Drugs / intoxication', Gambling: 'Gambling', MatureGame: 'Mature-rated game',
  ProfanityVulgarity: 'Profanity', SexualThemes: 'Sexual themes', ViolentGraphic: 'Graphic violence',
};

let deps = null;
let resultsRenderGeneration = 0;
let resultsEnrichmentObserver = null;
let resultsEnrichmentTimer = null;

export function configureResultsController(value) { deps = value; }
function requireDeps() { if (!deps) throw new Error('Results controller is not configured.'); return deps; }

function showToast(...args) { return requireDeps().showToast(...args); }
function showResultNotice(...args) { return requireDeps().showResultNotice(...args); }
function preferredScrollBehavior(...args) { return requireDeps().preferredScrollBehavior(...args); }
function getCustomTagsQuery(...args) { return requireDeps().getCustomTagsQuery(...args); }
function attachContentClassificationLabels(...args) { return requireDeps().attachContentClassificationLabels(...args); }
function openRaidDialog(...args) { return requireDeps().openRaidDialog(...args); }

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

function chatModesText(settings) {
  if (!settings) return 'Chat modes unavailable';
  const modes = [];
  if (settings.follower_mode) {
    const minutes = Number(settings.follower_mode_duration);
    modes.push(Number.isFinite(minutes) && minutes > 0
      ? `Followers-only · ${fmtNumber(minutes)} min`
      : 'Followers-only chat');
  }
  if (settings.subscriber_mode) modes.push('Subscribers-only chat');
  if (settings.emote_mode) modes.push('Emote-only chat');
  if (settings.slow_mode) {
    const seconds = Number(settings.slow_mode_wait_time);
    modes.push(Number.isFinite(seconds) && seconds > 0
      ? `Slow mode · ${fmtNumber(seconds)} sec`
      : 'Slow mode');
  }
  if (settings.unique_chat_mode) modes.push('Unique-chat mode');
  return modes.length ? modes.join(' · ') : 'Open chat';
}

function matchReasons(match) {
  if (match.directoryListing) return ['Channel you follow', 'Currently live'];
  const reasons = [];
  if (match.categoryMatchApplied) reasons.push('Matching category');
  if (match.meaningfulSharedTags?.length) {
    reasons.push(`${match.meaningfulSharedTags.length} shared Twitch tag${match.meaningfulSharedTags.length === 1 ? '' : 's'}`);
  }
  if (match.viewerCountDiffPercent <= 20) reasons.push('Similar live audience');
  else if (match.viewerCountDiffPercent <= 50) reasons.push('Compatible audience size');
  if (match.averageViewerCountDiffPercent <= 25) reasons.push('Similar 30-day average');
  if (match.streamDurationDiffMs <= 90 * 60 * 1000) reasons.push('Similar stream duration');
  return reasons.slice(0, 3);
}

function streamTagsHtml(match) {
  const searchedTags = ['matches', 'followed-live'].includes(state.resultsMode)
    ? getCustomTagsQuery()
    : [];
  const tags = prepareTagDisplay(match.stream.tags, match.sharedTags, searchedTags);
  if (!tags.length) {
    return '<div class="stream-tags" aria-label="Channel tags"><span class="stream-tags__label">Tags</span><span class="stream-tags__empty">None listed</span></div>';
  }
  return `<div class="stream-tags" aria-label="Channel tags; checkmarks indicate shared tags and pound signs indicate searched tags">
    <span class="stream-tags__label">Tags</span>
    ${tags.map((tag) => {
      const stateClass = tag.shared && tag.searched
        ? ' stream-tag--shared-searched'
        : tag.searched
          ? ' stream-tag--searched'
          : tag.shared
            ? ' stream-tag--shared'
            : '';
      const marker = tag.shared && tag.searched
        ? '✓ # '
        : tag.searched
          ? '# '
          : tag.shared
            ? '✓ '
            : '';
      const description = tag.shared && tag.searched
        ? 'shared with your stream and matches your tag search'
        : tag.searched
          ? 'matches your tag search'
          : tag.shared
            ? 'shared with your stream'
            : '';
      const accessibleState = description
        ? ` aria-label="${escapeHtml(tag.label)}, ${description}" title="${escapeHtml(description)}"`
        : '';
      return `<span class="stream-tag${tag.language ? ' stream-tag--language' : ''}${stateClass}"${accessibleState}>${marker ? `<span aria-hidden="true">${marker}</span>` : ''}${escapeHtml(tag.label)}</span>`;
    }).join('')}
  </div>`;
}

function renderTagMatchLegend() {
  const showSearched = ['matches', 'followed-live'].includes(state.resultsMode)
    && getCustomTagsQuery().length > 0;
  const showShared = state.resultsMode !== 'followed-live'
    && state.matches.some((match) => match.sharedTags?.length);
  el.tagLegendSearched.classList.toggle('hidden', !showSearched);
  el.tagLegendShared.classList.toggle('hidden', !showShared);
  el.tagMatchLegend.classList.toggle('hidden', !showSearched && !showShared);
}

export function renderResults() {
  const renderGeneration = ++resultsRenderGeneration;
  resultsEnrichmentObserver?.disconnect();
  resultsEnrichmentObserver = null;
  clearTimeout(resultsEnrichmentTimer);
  renderTagMatchLegend();
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
  const searchedTags = getCustomTagsQuery();
  for (const match of visibleMatches) {
    Object.assign(match, getSearchedTagMatch(match.stream.tags, searchedTags));
  }
  const sortedMatches = sortRaidMatches(visibleMatches, state.resultsSort);
  const page = paginate(sortedMatches, state.resultsPage, state.resultsPageSize);
  state.resultsPage = page.page;
  state.resultsPageSize = page.pageSize;
  el.resultsSort.value = state.resultsSort;
  el.resultsPageSize.value = String(page.pageSize);
  el.resultsPageSummary.textContent =
    `Showing ${page.startIndex + 1} to ${page.endIndex} of ${visibleMatches.length} · Page ${page.page} of ${page.pageCount}${Number.isFinite(state.searchCandidateCount) ? ` · ${Math.max(0, state.searchCandidateCount - state.matches.length)} filtered out` : ''}${state.resultsFetchedAt ? ` · Updated ${fmtDuration(Date.now() - state.resultsFetchedAt)} ago` : ''}`;
  el.resultsPrevPage.disabled = page.page === 1;
  el.resultsNextPage.disabled = page.page === page.pageCount;
  el.resultsPagination.classList.remove('hidden');
  updateShortlistButton();

  el.resultsList.innerHTML = page.items
    .map((m, i) => resultCardHtml(m, page.startIndex + i + 1))
    .join('');

  initializeVisibleCardEnrichment(page.items, renderGeneration);

  el.resultsList.querySelectorAll('[data-raid-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const match = state.matches.find(
        (candidate) => candidate.stream.user_id === btn.dataset.raidId
      );
      if (match) openRaidDialog(match);
    });
  });

  // Click a thumbnail to load a live embedded preview in place: only one
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
      if (state.shortlistedIds.has(id)) {
        state.shortlistedIds.delete(id);
        btn.textContent = 'Shortlist';
      } else if (state.shortlistedIds.size < 3) {
        state.shortlistedIds.add(id);
        btn.textContent = 'Remove shortlist';
      }
      else return showToast('You can compare up to three channels.');
      updateShortlistButton();
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
      btn.textContent = 'Refreshing...';
      const id = btn.dataset.refreshId;
      try {
        const stream = await state.api.getLiveStreamForUser(id);
        if (!stream) {
          state.matches = state.matches.filter((match) => match.stream.user_id !== id);
          state.shortlistedIds.delete(id);
          showToast('That channel is no longer live.');
        } else {
          await attachContentClassificationLabels([stream]);
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

async function loadFollowerDetailsForVisiblePage(matches, renderGeneration) {
  if (!matches.length) return;
  const loadingId = startLoading(`Loading details for ${matches.length} channel${matches.length === 1 ? '' : 's'}...`);
  const userIds = matches.map((match) => match.stream.user_id);
  try {
    const [counts, followsYou, chatSettings] = await Promise.all([
      state.api.getFollowerCountsForUsers(userIds),
      state.api.getUsersFollowingBroadcaster(state.user.id, userIds),
      state.api.getChatSettingsForUsers(userIds),
    ]);
    if (renderGeneration !== resultsRenderGeneration) return;

    for (const match of matches) {
      match.stream.follower_count = counts.get(match.stream.user_id) ?? null;
      match.stream.follows_you = followsYou.get(match.stream.user_id) ?? null;
      match.stream.chat_settings = chatSettings.get(match.stream.user_id) ?? null;
    }

    el.resultsList.querySelectorAll('[data-follower-id]').forEach((node) => {
      const match = matches.find((candidate) => candidate.stream.user_id === node.dataset.followerId);
      if (!match) return;
      const count = match.stream.follower_count;
      node.textContent = Number.isFinite(count)
        ? `${fmtNumber(count)} followers`
        : 'Followers unavailable';
    });

    el.resultsList.querySelectorAll('[data-follows-you-id]').forEach((node) => {
      const id = node.dataset.followsYouId;
      const match = matches.find((candidate) => candidate.stream.user_id === id);
      if (!match) return;
      const follows = match.stream.follows_you;
      if (follows === true) {
        node.textContent = match.stream.is_followed ? 'Mutual follow' : 'Follows you';
        node.classList.add('stat-chip--positive');
      } else if (follows === false) {
        node.textContent = match.stream.is_followed ? 'Does not follow you back' : 'Does not follow you';
      } else {
        node.textContent = 'Follow-back unavailable';
      }
    });

    el.resultsList.querySelectorAll('[data-chat-settings-id]').forEach((node) => {
      const match = matches.find((candidate) => candidate.stream.user_id === node.dataset.chatSettingsId);
      if (!match) return;
      const settings = match.stream.chat_settings;
      node.textContent = chatModesText(settings);
      node.classList.toggle(
        'stat-chip--restricted',
        settings?.follower_mode === true || settings?.subscriber_mode === true
      );
    });

    ChannelHistory.recordMany(matches.map((match) => ({
      stream: match.stream,
      followerCount: match.stream.follower_count,
    })));
  } finally {
    finishLoading(loadingId);
  }
}

function initializeVisibleCardEnrichment(matches, renderGeneration) {
  const byId = new Map(matches.map((match) => [match.stream.user_id, match]));
  const queuedIds = new Set();
  const needsDetails = (match) => !Object.hasOwn(match.stream, 'follower_count')
    || !Object.hasOwn(match.stream, 'follows_you')
    || match.stream.chat_settings === undefined;
  const flush = () => {
    resultsEnrichmentTimer = null;
    const pending = [...queuedIds]
      .map((id) => byId.get(id))
      .filter((match) => match && needsDetails(match));
    queuedIds.clear();
    if (pending.length) loadFollowerDetailsForVisiblePage(pending, renderGeneration);
  };

  const cards = [...el.resultsList.querySelectorAll('[data-result-id]')];
  if (!('IntersectionObserver' in window)) {
    loadFollowerDetailsForVisiblePage(matches.slice(0, 24), renderGeneration);
    return;
  }

  resultsEnrichmentObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = entry.target.dataset.resultId;
      const match = byId.get(id);
      resultsEnrichmentObserver.unobserve(entry.target);
      if (match && needsDetails(match)) queuedIds.add(id);
    }
    if (queuedIds.size && !resultsEnrichmentTimer) {
      resultsEnrichmentTimer = setTimeout(flush, 60);
    }
  }, { rootMargin: '500px 0px' });
  for (const card of cards) resultsEnrichmentObserver.observe(card);
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
  el.resultsPanel.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
});

el.resultsNextPage.addEventListener('click', () => {
  state.resultsPage += 1;
  state.expandedWatchId = null;
  state.expandedActivityId = null;
  renderResults();
  el.resultsPanel.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
});

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
        <div><dt>30-day observed average</dt><dd>~${fmtNumber(match.estimatedAverageViewers)} · ${escapeHtml(match.historyConfidence)}</dd></div>
        <div><dt>Live for</dt><dd>${fmtDuration(Date.now() - new Date(stream.started_at).getTime())}</dd></div>
        <div><dt>Shared tags</dt><dd>${match.meaningfulSharedTags?.length ?? 0}</dd></div>
        <div><dt>Relationship</dt><dd>${stream.is_followed ? 'Following' : 'Not followed'}</dd></div>
      </dl>
      ${!state.myStream || state.usingPreviousStream
        ? '<button class="btn btn--outline" type="button" disabled>Go live to raid</button>'
        : state.raidPermissionEnabled
          ? `<button class="btn btn--outline" type="button" data-compare-raid="${escapeHtml(stream.user_id)}">Raid this channel</button>`
          : '<button class="btn btn--outline" type="button" data-enable-raid-permission>Enable raid controls</button>'}
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
  const loadingId = startLoading(`Loading recent activity for ${stream.user_name}...`);

  try {
  const { videos, clips, scheduleContext, profile, trackerSummary } =
    await loadCreatorDetails(state.api, stream);
  if (
    renderGeneration !== resultsRenderGeneration ||
    state.expandedActivityId !== stream.user_id
  ) return;

  const history = ChannelHistory.getSummary(stream.user_id);

  panel.innerHTML = recentActivityHtml({
    stream, match, videos, clips, scheduleContext, profile, history, trackerSummary,
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
  } finally {
    finishLoading(loadingId);
  }
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
    // Twitch's player needs a `parent` matching the hosting domain.
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
    : state.raidPermissionEnabled
      ? `<button class="btn btn--outline" data-raid-id="${escapeHtml(s.user_id)}">Raid this channel</button>`
      : '<button class="btn btn--outline" type="button" data-enable-raid-permission>Enable raid controls</button>';
  const previewButton = state.expandedWatchId === s.user_id
    ? `<button class="btn btn--ghost" type="button" data-watch-id="${escapeHtml(s.user_id)}">Close preview</button>`
    : `<button class="btn btn--ghost" type="button" data-watch-id="${escapeHtml(s.user_id)}">Preview stream</button>`;
  const activityExpanded = state.expandedActivityId === s.user_id;
  const activityButton = `<button class="btn btn--ghost result-card__activity-button" type="button" data-activity-id="${escapeHtml(s.user_id)}" aria-expanded="${activityExpanded}">${activityExpanded ? 'Close details' : 'View details'}</button>`;
  const followingText = s.followed_at
    ? `Following since ${fmtDate(s.followed_at, { month: 'short', year: 'numeric' })}`
    : 'Following';
  const chatSettingsText = s.chat_settings === undefined
    ? 'Checking chat modes...'
    : chatModesText(s.chat_settings);
  const followerText = Object.hasOwn(s, 'follower_count')
    ? Number.isFinite(s.follower_count) ? `${fmtNumber(s.follower_count)} followers` : 'Followers unavailable'
    : 'Loading followers...';
  const followsYouText = !Object.hasOwn(s, 'follows_you')
    ? 'Checking follow-back...'
    : s.follows_you === true
      ? s.is_followed ? 'Mutual follow' : 'Follows you'
      : s.follows_you === false
        ? s.is_followed ? 'Does not follow you back' : 'Does not follow you'
        : 'Follow-back unavailable';
  const followsYouClass = s.follows_you === true ? ' stat-chip--positive' : '';
  return `
    <li class="result-card" data-result-id="${escapeHtml(s.user_id)}">
      <div class="result-card__header">
        <span class="result-card__rank">${rank}</span>
        <div class="result-card__identity">
          <span class="result-card__name">${escapeHtml(s.user_name)}</span>
          <span class="result-card__match-label">${isDirectoryListing ? 'Live channel you follow' : scoreLabel(scorePct)}</span>
        </div>
        ${isDirectoryListing ? '<span class="following-tag">Following · live now</span>' : `<div class="meter ${scoreClass(scorePct)}" title="${scorePct}% match: ${scoreLabel(scorePct)}" aria-label="${scorePct}% match, ${scoreLabel(scorePct)}">
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
        <span class="stat-chip" title="${escapeHtml(match.historyConfidence)} from ${fmtNumber(match.historySessionCount || 0)} observed stream session${match.historySessionCount === 1 ? '' : 's'}"><span class="stat-chip__mono">~${fmtNumber(match.estimatedAverageViewers)}</span> 30-day avg · ${escapeHtml(match.historyConfidence)}</span>
        <span class="stat-chip"><span class="stat-chip__mono">${fmtDuration(Date.now() - new Date(s.started_at).getTime())}</span> live</span>
        <span class="stat-chip" data-follower-id="${escapeHtml(s.user_id)}">${escapeHtml(followerText)}</span>
        <span class="stat-chip${followsYouClass}" data-follows-you-id="${escapeHtml(s.user_id)}">${escapeHtml(followsYouText)}</span>
        <span class="stat-chip${s.chat_settings?.follower_mode || s.chat_settings?.subscriber_mode ? ' stat-chip--restricted' : ''}" data-chat-settings-id="${escapeHtml(s.user_id)}">${escapeHtml(chatSettingsText)}</span>
      </div>
      <div class="result-card__actions">
        <a class="watch-link" href="https://twitch.tv/${escapeHtml(s.user_login)}" target="_blank" rel="noopener noreferrer">Open on Twitch ↗</a>
      </div>
      ${activityButton}
      ${activityExpanded ? `<section class="recent-activity" data-activity-panel="${escapeHtml(s.user_id)}" aria-label="Details for ${escapeHtml(s.user_name)}"><p class="activity-empty"><strong>30-day observed average:</strong> ~${fmtNumber(match.estimatedAverageViewers)} viewers${match.averageIsHistorical ? '' : ' (early estimate)'}<br />Loading channel history...</p></section>` : ''}
      <div class="result-card__buttons">
        <button class="btn btn--ghost" type="button" data-shortlist-id="${escapeHtml(s.user_id)}">${state.shortlistedIds.has(s.user_id) ? 'Remove shortlist' : 'Shortlist'}</button>
        <button class="btn btn--ghost" type="button" data-refresh-id="${escapeHtml(s.user_id)}">Refresh</button>
        <button class="btn btn--ghost" type="button" data-hide-id="${escapeHtml(s.user_id)}">Hide</button>
        ${previewButton}
        ${raidButton}
      </div>
    </li>`;
}


import { state } from '../app/state.js?v=90';
import { el } from '../app/elements.js?v=90';
import { logger } from '../app/logger.js?v=90';
import { applyHardFilters, findRaidMatches } from '../raid-match.js?v=90';
import { PreviousStreamHistory } from '../previous-stream-history.js?v=90';
import { calculateViewerRange } from '../viewer-tolerance.js?v=90';
import { resolveDiscoveryMode } from '../discovery-mode.js?v=90';
import { filterStreamsByContentLabels } from '../content-label-filter.js?v=90';
import { buildFollowedDirectoryMatches } from '../followed-directory.js?v=90';
import { startLoading, finishLoading } from '../loading-state.js?v=90';

let deps = null;
let searchGeneration = 0;
export function configureSearchController(value) { deps = value; }
export function invalidateSearch() { searchGeneration += 1; }
function requireDeps() { if (!deps) throw new Error('Search controller is not configured.'); return deps; }

function showToast(...args) { return requireDeps().showToast(...args); }
function showResultNotice(...args) { return requireDeps().showResultNotice(...args); }
function showSearchStatus(...args) { return requireDeps().showSearchStatus(...args); }
function loadingCardsHtml(...args) { return requireDeps().loadingCardsHtml(...args); }
function getSelectedStatuses(...args) { return requireDeps().getSelectedStatuses(...args); }
function getViewerTolerancePercent(...args) { return requireDeps().getViewerTolerancePercent(...args); }
function getCustomTagsQuery(...args) { return requireDeps().getCustomTagsQuery(...args); }
function getSelectedLanguageTag(...args) { return requireDeps().getSelectedLanguageTag(...args); }
function getContentLabelFilter(...args) { return requireDeps().getContentLabelFilter(...args); }
function attachContentClassificationLabels(...args) { return requireDeps().attachContentClassificationLabels(...args); }
function renderResults(...args) { return requireDeps().renderResults(...args); }
function invalidateFollowedLive(...args) { return requireDeps().invalidateFollowedLive(...args); }

export async function runSearch() {
  const wantsOnlyFollowing = el.onlyFollowingFilter.checked;
  const usingOfflineFollowingMode = !state.myStream && wantsOnlyFollowing;
  if (!state.myStream && !usingOfflineFollowingMode) return;
  state.shortlistedIds.clear();
  state.hiddenResultIds.clear();
  state.searchAbortController?.abort();
  state.searchAbortController = new AbortController();
  const searchSignal = state.searchAbortController.signal;
  invalidateFollowedLive();
  state.resultsMode = 'matches';
  if (state.myStream && !state.usingPreviousStream) PreviousStreamHistory.record(state.myStream);

  const generation = ++searchGeneration;
  const loadingId = startLoading('Finding live Twitch channels...');

  const selectedStatuses = getSelectedStatuses();
  const wantsSameTeam = el.sameTeamFilter.checked && !el.sameTeamFilter.disabled;
  const wantsOpenChatOnly = el.openChatOnlyFilter.checked;
  const viewerTolerancePercent = getViewerTolerancePercent();
  const showAllViewerCounts = usingOfflineFollowingMode || viewerTolerancePercent === null;
  const tags = getCustomTagsQuery();
  const languageTag = getSelectedLanguageTag();
  const contentLabelFilter = getContentLabelFilter();

  el.findBtn.disabled = true;
  el.findBtn.textContent = 'Finding matches...';

  el.resultsPanel.classList.remove('hidden');
  el.resultsPagination.classList.add('hidden');
  el.resultsList.innerHTML = loadingCardsHtml();
  const hasPrimaryCategory = el.includeCurrentCategory.checked && Boolean(state.myStream?.game_id);
  showSearchStatus(wantsOnlyFollowing
    ? 'Loading every followed channel live now and checking your typed tags...'
    : hasPrimaryCategory || state.extraCategories.length
      ? 'Scanning your selected categories...'
      : 'Scanning live channels across Twitch for tag matches...');

  try {
    const {
      individualGameIds,
      genreGameIds,
      categoryMatchApplied,
      useFollowedStreamsEndpoint: usingFollowedStreamsEndpoint,
    } = resolveDiscoveryMode({
      onlyFollowing: wantsOnlyFollowing,
      primaryGameId: el.includeCurrentCategory.checked ? state.myStream?.game_id : '',
      extraCategories: state.extraCategories,
    });

    const viewerRange = state.myStream
      ? calculateViewerRange(state.myStream.viewer_count, viewerTolerancePercent)
      : null;
    const minimumMatchedViewers = viewerRange?.min ?? null;
    const candidateRequests = [];

    if (usingFollowedStreamsEndpoint) {
      showSearchStatus('Loading every channel you follow that is currently live...');
      candidateRequests.push(state.api.getFollowedLiveStreams(state.user.id, { signal: searchSignal }));
    } else {
      const selectedGameIds = [...new Set([...individualGameIds, ...genreGameIds])];
      if (selectedGameIds.length) {
        candidateRequests.push(state.api.getLiveStreamsByGames(selectedGameIds, {
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
      requiredLanguageTag: languageTag,
    });

    showSearchStatus(`Comparing ${candidatesToEnrich.length} live channel${candidatesToEnrich.length === 1 ? '' : 's'} that passed your filters...`);

    await attachContentClassificationLabels(candidatesToEnrich, { signal: searchSignal });
    if (generation !== searchGeneration) return;
    const needsClassificationData = [...contentLabelFilter.include, ...contentLabelFilter.exclude]
      .some((id) => id !== 'MatureAudience');
    const contentFilteredCandidates = filterStreamsByContentLabels(
      candidatesToEnrich,
      contentLabelFilter
    ).filter((stream) => !needsClassificationData || stream.content_labels_available === true);
    if (
      needsClassificationData &&
      contentFilteredCandidates.length < candidatesToEnrich.length &&
      candidatesToEnrich.some((stream) => stream.content_labels_available !== true) &&
      !state.contentLabelsWarningShown
    ) {
      showToast('Some channels were left out because Twitch did not return their content labels.', true);
      state.contentLabelsWarningShown = true;
    }
    candidatesToEnrich.splice(0, candidatesToEnrich.length, ...contentFilteredCandidates);

    // broadcaster_type isn't on /streams: look it up in one batched call
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
    showSearchStatus('Checking channels you already follow...');
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
      logger.error(e);
      // Follow state is enrichment. A failed lookup must not mark every
      // creator as "not followed" or interrupt ordinary matching.
      for (const s of candidatesToEnrich) {
        s.is_followed = null;
        s.followed_at = null;
      }
      const status = Number(e?.status) || null;
      const authorizationFailure = status === 401 || status === 403;
      if (wantsOnlyFollowing) {
        el.resultsList.innerHTML = '';
        state.matches = [];
        showResultNotice({
          title: 'Follow list unavailable',
          message: authorizationFailure
            ? 'Twitch could not authorize access to your follow list. Reconnect Twitch and approve the follow permission.'
            : 'Wormhole could not load your follow list right now. Your Twitch connection is still active; try the search again in a moment.',
          retry: !authorizationFailure,
        });
        return;
      }
      // Normal discovery does not need follow status. Only surface an action
      // when Twitch explicitly reports an authorization problem; transient
      // API/network failures degrade quietly.
      if (authorizationFailure && !state.followStatusWarningShown) {
        showToast('Reconnect Twitch to check which channels you already follow.', true);
        state.followStatusWarningShown = true;
      }
    }

    // Team membership has no batch endpoint (one request per channel), so
    // only fetch it for candidates that already survive the cheap filters
    //: narrowing the list first keeps this from firing 100 requests when
    // most of them would've been filtered out anyway.
    if (wantsSameTeam) {
      showSearchStatus('Checking shared Twitch teams...');

      const preFiltered = applyHardFilters(candidatesToEnrich, {
        allowedBroadcasterTypes: selectedStatuses,
        requireFollowed: wantsOnlyFollowing,
        requiredTags: tags,
        requiredLanguageTag: languageTag,
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

    if (wantsOpenChatOnly) {
      const chatModeCandidates = applyHardFilters(candidatesToEnrich, {
        allowedBroadcasterTypes: selectedStatuses,
        requireFollowed: wantsOnlyFollowing,
        requireSharedTeam: wantsSameTeam,
        requiredTags: tags,
        requiredLanguageTag: languageTag,
      });
      if (chatModeCandidates.length) {
        showSearchStatus(`Checking chat settings for ${chatModeCandidates.length} channel${chatModeCandidates.length === 1 ? '' : 's'}...`);
        const chatSettings = await state.api.getChatSettingsForUsers(
          chatModeCandidates.map((stream) => stream.user_id),
          { signal: searchSignal }
        );
        if (generation !== searchGeneration) return;
        let availableCount = 0;
        for (const stream of chatModeCandidates) {
          stream.chat_settings = chatSettings.get(stream.user_id) ?? null;
          if (stream.chat_settings) availableCount += 1;
        }
        if (!availableCount) {
          state.matches = [];
          el.resultsList.innerHTML = '';
          showResultNotice({
            title: 'Chat settings unavailable',
            message: 'Wormhole could not check follower, subscriber, and emote chat restrictions right now. Try the search again.',
            retry: true,
          });
          return;
        }
        if (availableCount < chatModeCandidates.length && !state.chatSettingsWarningShown) {
          showToast('Some channels were left out because Twitch did not return their chat settings.', true);
          state.chatSettingsWarningShown = true;
        }
      }
    }

    if (usingOfflineFollowingMode) {
      const filteredFollowedStreams = applyHardFilters(candidatesToEnrich, {
        allowedBroadcasterTypes: selectedStatuses,
        requireFollowed: true,
        requireSharedTeam: wantsSameTeam,
        requiredTags: tags,
        requiredLanguageTag: languageTag,
        requireOpenChat: wantsOpenChatOnly,
      });
      state.matches = buildFollowedDirectoryMatches(filteredFollowedStreams);
    } else {
      state.matches = findRaidMatches(state.myStream, candidatesToEnrich, {
        viewerTolerancePercent: viewerTolerancePercent ?? 50,
        ignoreViewerTolerance: showAllViewerCounts,
        allowedBroadcasterTypes: selectedStatuses,
        requireFollowed: wantsOnlyFollowing,
        requireSharedTeam: wantsSameTeam,
        requiredTags: tags,
        requiredLanguageTag: languageTag,
        requireOpenChat: wantsOpenChatOnly,
        compareTags: el.matchStreamTags.checked,
        categoryMatchApplied,
        primaryCategoryId: el.includeCurrentCategory.checked ? state.myStream.game_id : '',
      });
    }
    state.resultsFetchedAt = Date.now();
    state.resultsPage = 1;
    renderResults();
  } catch (e) {
    if (generation !== searchGeneration) return;
    if (e?.name === 'AbortError') return;
    logger.error(e);
    el.resultsList.innerHTML = '';
    showResultNotice({
      title: 'The search hit turbulence',
      message: 'Wormhole could not fetch raid matches. Check your connection and try again.',
      retry: true,
    });
  } finally {
    finishLoading(loadingId);
    if (generation === searchGeneration && (state.myStream || el.onlyFollowingFilter.checked)) {
      el.findBtn.disabled = false;
      el.findBtn.textContent = state.myStream
        ? 'Find someone to raid'
        : 'Find followed live channels';
    }
  }
}

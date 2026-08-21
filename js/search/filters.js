import { state } from '../app/state.js?v=90';
import { el } from '../app/elements.js?v=90';
import { escapeHtml } from '../app/format.js?v=90';
import { getGenreGameNames, getGenreLabelsForGame } from '../genre-presets.js?v=90';
import { isLanguageTag, parseTagInput } from '../language-tags.js?v=90';
import { normalizeContentLabelFilter } from '../content-label-filter.js?v=90';
import { loadFilterPreset, saveFilterPreset } from '../filter-preset-storage.js?v=90';

let deps = null;
export function configureFiltersController(value) { deps = value; }
function requireDeps() { if (!deps) throw new Error('Filters controller is not configured.'); return deps; }
function runSearch(...args) { return requireDeps().runSearch(...args); }
function renderResults(...args) { return requireDeps().renderResults(...args); }
function renderViewerMatchHint(...args) { return requireDeps().renderViewerMatchHint(...args); }
function runCategorySearch(...args) { return requireDeps().runCategorySearch(...args); }
function renderSelectedCategories(...args) { return requireDeps().renderSelectedCategories(...args); }
function showToast(...args) { return requireDeps().showToast(...args); }
function updateViewerHint(...args) { return requireDeps().updateViewerHint(...args); }

// Re-run the search automatically when a filter changes, but only if
// results are already showing: no point searching before the first click.
export function rerunIfResultsVisible() {
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
el.onlyFollowingFilter.addEventListener('change', () => {
  if (!state.myStream) {
    el.findBtn.disabled = !el.onlyFollowingFilter.checked;
    el.findBtn.textContent = el.onlyFollowingFilter.checked
      ? 'Find followed live channels'
      : 'Find someone to raid';
    if (!el.onlyFollowingFilter.checked && state.resultsMode === 'matches') {
      invalidateSearch();
      state.matches = [];
      el.resultsPanel.classList.add('hidden');
    }
    renderViewerMatchHint();
  }
  onFilterChanged();
});
el.includeCurrentCategory.addEventListener('change', onFilterChanged);
el.openChatOnlyFilter.addEventListener('change', onFilterChanged);
el.sameTeamFilter.addEventListener('change', onFilterChanged);
let followedTagHighlightDebounce = null;
el.tagsInput.addEventListener('input', () => {
  renderSuggestedTags();
  renderActiveFilters();
  if (
    state.resultsMode === 'matches' &&
    el.onlyFollowingFilter.checked &&
    !el.resultsPanel.classList.contains('hidden')
  ) {
    clearTimeout(followedTagHighlightDebounce);
    followedTagHighlightDebounce = setTimeout(() => runSearch(), 250);
    return;
  }
  if (
    state.resultsMode === 'followed-live'
    && !el.resultsPanel.classList.contains('hidden')
  ) {
    clearTimeout(followedTagHighlightDebounce);
    followedTagHighlightDebounce = setTimeout(() => renderResults(), 150);
  }
});
el.tagsInput.addEventListener('change', rerunIfResultsVisible);
el.contentLabelFilters.addEventListener('change', onFilterChanged);
el.matchStreamTags.addEventListener('change', onFilterChanged);
el.languageSelect.addEventListener('change', () => {
  onFilterChanged();
});

// Partner/Affiliate are additive toggles on top of the always-included
// non-affiliate majority: unchecking both doesn't hide anyone, it just
// stops adding partners/affiliates on top of everyone else. This avoids
// the confusing old behavior where unchecking everything showed nothing.
export function getSelectedStatuses() {
  const checked = [...el.statusFilters.querySelectorAll('input[type="checkbox"]')]
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
  return [...new Set([...checked, 'none'])];
}

export function getCustomTagsQuery() {
  return parseTagInput(el.tagsInput.value).filter((tag) => !isLanguageTag(tag));
}

export function renderSuggestedTags() {
  const selected = new Set(getCustomTagsQuery().map(normalizeTagKey));
  el.suggestedTags.querySelectorAll('[data-suggested-tag]').forEach((button) => {
    const active = selected.has(normalizeTagKey(button.dataset.suggestedTag));
    button.setAttribute('aria-pressed', String(active));
    button.classList.toggle('suggested-tags__button--active', active);
  });
}

el.suggestedTags.addEventListener('click', (event) => {
  const button = event.target.closest('[data-suggested-tag]');
  if (!button) return;
  const selectedTag = button.dataset.suggestedTag;
  const selectedKey = normalizeTagKey(selectedTag);
  const current = getCustomTagsQuery();
  const exists = current.some((tag) => normalizeTagKey(tag) === selectedKey);
  el.tagsInput.value = (exists
    ? current.filter((tag) => normalizeTagKey(tag) !== selectedKey)
    : [...current, selectedTag]
  ).join(', ');
  renderSuggestedTags();
  renderActiveFilters();
  rerunIfResultsVisible();
});

export function getContentLabelFilter() {
  const include = [];
  const exclude = [];
  el.contentLabelFilters.querySelectorAll('[data-content-label]').forEach((select) => {
    if (select.value === 'include') include.push(select.dataset.contentLabel);
    if (select.value === 'exclude') exclude.push(select.dataset.contentLabel);
  });
  return normalizeContentLabelFilter({ include, exclude });
}

export function applyContentLabelFilterToControls(value) {
  const filter = normalizeContentLabelFilter(value);
  el.contentLabelFilters.querySelectorAll('[data-content-label]').forEach((select) => {
    select.value = filter.include.includes(select.dataset.contentLabel)
      ? 'include'
      : filter.exclude.includes(select.dataset.contentLabel)
        ? 'exclude'
        : 'any';
  });
}

export function getSelectedLanguageTag() {
  return el.languageSelect.value.trim();
}

export function getTagsQuery() {
  const tags = getCustomTagsQuery();
  const languageTag = getSelectedLanguageTag();
  return languageTag ? [...tags, languageTag] : tags;
}

export function getMeaningfulMyTags() {
  return (state.myStream?.tags ?? []).filter((tag) => !isLanguageTag(tag));
}

export function renderTagMatchHint() {
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

export function getSelectedGenreIds() {
  return [...el.genreFilters.querySelectorAll('input[type="checkbox"]:checked')]
    .map((checkbox) => checkbox.value);
}

export function getViewerTolerancePercent() {
  const selected = el.viewerToleranceFilter.querySelector('input:checked')?.value ?? '50';
  return parseViewerTolerance(selected);
}

export function renderActiveFilters() {
  const filters = [];
  const viewerTolerance = getViewerTolerancePercent();
  if (viewerTolerance !== null) {
    const viewerPresentation = describeViewerRange(state.myStream?.viewer_count, viewerTolerance);
    filters.push({ key: 'viewer-range', label: viewerPresentation.chipText });
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
  if (el.openChatOnlyFilter.checked) {
    filters.push({ key: 'open-chat-only', label: 'Exclude restricted chat' });
  }
  if (!el.includeCurrentCategory.checked && state.myStream?.game_id) {
    filters.push({ key: 'current-category', label: 'Exclude my category' });
  }
  if (el.matchStreamTags.checked) {
    filters.push({ key: 'my-tags', label: 'Match my tags' });
  }
  for (const tag of getTagsQuery()) {
    filters.push({ key: `tag:${tag}`, label: `#${tag}` });
  }
  const contentFilter = getContentLabelFilter();
  for (const mode of ['include', 'exclude']) {
    for (const id of contentFilter[mode]) {
      const label = CONTENT_FILTER_LABELS.find((item) => item.id === id)?.label ?? id;
      filters.push({
        key: `content:${mode}:${id}`,
        label: `${mode === 'include' ? 'Require' : 'Exclude'}: ${label}`,
      });
    }
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
  const emptyFilterMessage = state.myStream?.game_id && el.includeCurrentCategory.checked
    ? 'No extra restrictions: your current category is included.'
    : 'No category restriction: searching across Twitch with your tag and audience settings.';
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
  } else if (key === 'same-team') {
    el.sameTeamFilter.checked = false;
  } else if (key === 'only-following') {
    el.onlyFollowingFilter.checked = false;
  } else if (key === 'open-chat-only') {
    el.openChatOnlyFilter.checked = false;
  } else if (key === 'current-category') {
    el.includeCurrentCategory.checked = true;
  } else if (key === 'my-tags') {
    el.matchStreamTags.checked = false;
  } else if (key.startsWith('status:')) {
    const value = key.slice('status:'.length);
    const checkbox = [...el.statusFilters.querySelectorAll('input')]
      .find((input) => input.value === value);
    if (checkbox) checkbox.checked = true;
  } else if (key.startsWith('tag:')) {
    const removedTag = key.slice('tag:'.length).toLowerCase();
    el.tagsInput.value = getCustomTagsQuery()
      .filter((tag) => tag.toLowerCase() !== removedTag)
      .join(', ');
    if (el.languageSelect.value.toLowerCase() === removedTag) {
      el.languageSelect.value = '';
    }
    renderSuggestedTags();
  } else if (key.startsWith('content:')) {
    const [, , id] = key.split(':');
    const select = el.contentLabelFilters.querySelector(`[data-content-label="${id}"]`);
    if (select) select.value = 'any';
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
  el.includeCurrentCategory.checked = true;
  el.openChatOnlyFilter.checked = false;
  el.sameTeamFilter.checked = false;
  el.matchStreamTags.checked = false;
  el.languageSelect.value = '';
  el.tagsInput.value = '';
  applyContentLabelFilterToControls({});
  renderSuggestedTags();
  el.genreFilters.querySelectorAll('input').forEach((input) => { input.checked = false; });
  state.extraCategories = [];
  el.genreHint.textContent = 'Choose one or more genre groups; selections apply automatically.';
  renderViewerMatchHint();
  renderSelectedCategories();
  rerunIfResultsVisible();
});

let genreApplyDebounce = null;
let genreApplyGeneration = 0;

export async function applyGenreSelection({ showEmptyError = false } = {}) {
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
  const loadingId = startLoading('Loading Twitch categories for those groups...');
  el.addGenresBtn.disabled = true;
  el.genreHint.textContent = 'Checking those games against Twitch categories...';
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
    el.genreHint.textContent = `${totalGenreCategories} genre ${totalGenreCategories === 1 ? 'category' : 'categories'} selected${unresolved.length ? `; Twitch did not find ${unresolved.length} of the listed games` : ''}. Remove individual games below if needed.`;
    rerunIfResultsVisible();
  } catch (error) {
    if (generation !== genreApplyGeneration) return;
    logger.error(error);
    el.genreHint.textContent = 'Twitch did not return those categories. Try again.';
    showToast('Those categories could not be added.', true);
  } finally {
    finishLoading(loadingId);
    if (generation === genreApplyGeneration) el.addGenresBtn.disabled = false;
  }
}

el.addGenresBtn.addEventListener('click', () => applyGenreSelection({ showEmptyError: true }));

el.genreFilters.addEventListener('change', () => {
  clearTimeout(genreApplyDebounce);
  const selected = getSelectedGenreIds();
  el.genreHint.textContent = selected.length
    ? 'Applying selected genre groups...'
    : 'Clearing genre categories...';
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


function currentFilterPreset() {
  return {
    viewerTolerance: el.viewerToleranceFilter.querySelector('input:checked')?.value ?? '50',
    statuses: [...el.statusFilters.querySelectorAll('input:checked')].map((input) => input.value),
    onlyFollowing: el.onlyFollowingFilter.checked,
    includeCurrentCategory: el.includeCurrentCategory.checked,
    openChatOnly: el.openChatOnlyFilter.checked,
    sameTeam: el.sameTeamFilter.checked,
    matchStreamTags: el.matchStreamTags.checked,
    language: el.languageSelect.value,
    tags: el.tagsInput.value,
    contentLabels: getContentLabelFilter(),
    genres: getSelectedGenreIds(),
    categories: state.extraCategories,
  };
}

el.saveFilterPreset.addEventListener('click', () => {
  saveFilterPreset(currentFilterPreset());
  showToast('Filters saved in this browser.');
});

el.loadFilterPreset.addEventListener('click', () => {
  const preset = loadFilterPreset();
  if (!preset) return showToast('No saved filter preset was found.');
  const tolerance = el.viewerToleranceFilter.querySelector(`[value="${preset.viewerTolerance}"]`);
  if (tolerance) tolerance.checked = true;
  el.statusFilters.querySelectorAll('input').forEach((input) => { input.checked = preset.statuses.includes(input.value); });
  el.onlyFollowingFilter.checked = preset.onlyFollowing;
  el.includeCurrentCategory.checked = preset.includeCurrentCategory;
  el.openChatOnlyFilter.checked = preset.openChatOnly;
  el.sameTeamFilter.checked = preset.sameTeam;
  el.matchStreamTags.checked = preset.matchStreamTags;
  el.languageSelect.value = preset.language;
  el.tagsInput.value = parseTagInput(preset.tags)
    .filter((tag) => !isLanguageTag(tag))
    .join(', ');
  applyContentLabelFilterToControls(preset.contentLabels);
  renderSuggestedTags();
  el.genreFilters.querySelectorAll('input').forEach((input) => { input.checked = preset.genres.includes(input.value); });
  state.extraCategories = preset.categories;
  renderSelectedCategories();
  renderActiveFilters();
  updateViewerHint();
  showToast('Saved filters applied.');
});


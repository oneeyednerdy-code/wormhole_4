import { state } from '../app/state.js?v=91';
import { el } from '../app/elements.js?v=91';
import { escapeHtml } from '../app/format.js?v=91';
import { logger } from '../app/logger.js?v=91';
import { startLoading, finishLoading } from '../loading-state.js?v=91';
import { rerunIfResultsVisible, renderActiveFilters } from './filters.js?v=91';

let categorySearchDebounce = null;
let categorySearchGeneration = 0;

export async function runCategorySearch(query) {
  const generation = ++categorySearchGeneration;
  const normalizedQuery = query.trim();
  const loadingId = startLoading('Searching Twitch categories...');
  try {
    const results = await state.api.searchCategories(normalizedQuery, { maxResults: 20 });
    if (
      generation !== categorySearchGeneration ||
      el.categorySearchInput.value.trim() !== normalizedQuery
    ) return;
    renderCategorySuggestions(results);
  } catch (e) {
    if (generation !== categorySearchGeneration) return;
    logger.error(e);
    hideCategorySuggestions();
  } finally {
    finishLoading(loadingId);
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

export function renderSelectedCategories() {
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



el.categorySearchInput.addEventListener('input', () => {
  clearTimeout(categorySearchDebounce);
  const query = el.categorySearchInput.value;
  if (!query.trim()) { hideCategorySuggestions(); return; }
  categorySearchDebounce = setTimeout(() => runCategorySearch(query), 300);
});

el.categorySearchInput.addEventListener('blur', () => {
  setTimeout(hideCategorySuggestions, 150);
});

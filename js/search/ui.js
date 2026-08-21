import { el } from '../app/elements.js?v=90';
import { escapeHtml } from '../app/format.js?v=90';
let deps = null;
export function configureSearchUi(value) { deps = value; }
function runSearch(...args) { if (!deps) throw new Error('Search UI is not configured.'); return deps.runSearch(...args); }

export function loadingCardsHtml(count = 6) {
  return Array.from({ length: count }, () => `
    <li class="result-card result-card--skeleton" aria-hidden="true">
      <div class="skeleton skeleton--heading"></div>
      <div class="skeleton skeleton--media"></div>
      <div class="skeleton skeleton--line"></div>
      <div class="skeleton skeleton--line skeleton--short"></div>
    </li>`).join('');
}

export function showSearchStatus(message) {
  el.resultsStatus.innerHTML = `
    <div class="search-state search-state--loading">
      <span class="search-state__spinner" aria-hidden="true"></span>
      <div><strong>Searching Twitch</strong><p>${escapeHtml(message)}</p></div>
    </div>`;
  el.resultsStatus.classList.remove('hidden');
}

export function showResultNotice({ title, message, retry = false }) {
  el.resultsStatus.innerHTML = `
    <div class="search-state">
      <span class="search-state__icon" aria-hidden="true">◎</span>
      <div><strong>${escapeHtml(title)}</strong><p>${escapeHtml(message)}</p></div>
      ${retry ? '<button class="btn btn--ghost" type="button" data-retry-search>Try again</button>' : ''}
    </div>`;
  el.resultsStatus.classList.remove('hidden');
  el.resultsStatus.querySelector('[data-retry-search]')?.addEventListener('click', () => runSearch());
}



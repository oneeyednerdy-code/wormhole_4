export const CONTRAST_PREFERENCE_KEY = 'wormhole_high_contrast';

export function applyContrast(documentRef, enabled) {
  const root = documentRef.documentElement;
  const body = documentRef.body;
  const button = documentRef.getElementById('contrast-toggle');
  root.toggleAttribute('data-high-contrast', enabled);
  body?.classList.toggle('high-contrast', enabled);
  if (button) {
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = enabled ? 'Standard contrast' : 'High contrast';
  }
}

export function applyFilterVisibility(documentRef, expanded) {
  const panel = documentRef.getElementById('filters-panel');
  const content = documentRef.getElementById('filters-content');
  const button = documentRef.getElementById('filters-toggle');
  panel?.classList.toggle('filters-panel--collapsed', !expanded);
  if (content) content.hidden = !expanded;
  if (button) {
    button.setAttribute('aria-expanded', String(expanded));
    button.textContent = expanded ? 'Hide filters' : 'Show filters';
  }
}

export function initializeUiControls(documentRef = document, storage = localStorage) {
  const contrastButton = documentRef.getElementById('contrast-toggle');
  const filtersButton = documentRef.getElementById('filters-toggle');
  if (!contrastButton || !filtersButton) return false;

  let contrastEnabled = false;
  try {
    contrastEnabled = storage.getItem(CONTRAST_PREFERENCE_KEY) === 'true';
  } catch {
    // Storage may be unavailable in privacy modes; the control still works.
  }
  applyContrast(documentRef, contrastEnabled);
  applyFilterVisibility(documentRef, true);

  contrastButton.addEventListener('click', () => {
    contrastEnabled = !documentRef.documentElement.hasAttribute('data-high-contrast');
    applyContrast(documentRef, contrastEnabled);
    try {
      storage.setItem(CONTRAST_PREFERENCE_KEY, String(contrastEnabled));
    } catch {
      // Keep the preference for this page load when storage is unavailable.
    }
  });

  filtersButton.addEventListener('click', () => {
    const expanded = filtersButton.getAttribute('aria-expanded') !== 'true';
    applyFilterVisibility(documentRef, expanded);
  });
  return true;
}

if (typeof document !== 'undefined') initializeUiControls();

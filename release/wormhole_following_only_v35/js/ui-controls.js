export const CONTRAST_PREFERENCE_KEY = 'wormhole_high_contrast';
export const THEME_PREFERENCE_KEY = 'wormhole_light_mode';

function getThemeButtons(documentRef) {
  const buttons = documentRef.querySelectorAll?.('[data-theme-toggle]');
  if (buttons?.length) return Array.from(buttons);
  const fallback = documentRef.getElementById('theme-toggle');
  return fallback ? [fallback] : [];
}

export function applyTheme(documentRef, lightEnabled) {
  documentRef.documentElement.toggleAttribute('data-light-theme', lightEnabled);
  documentRef.body?.classList.toggle('light-theme', lightEnabled);
  for (const button of getThemeButtons(documentRef)) {
    button.setAttribute('aria-pressed', String(lightEnabled));
    button.textContent = lightEnabled ? 'Dark mode' : 'Light mode';
  }
}

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
  const themeButtons = getThemeButtons(documentRef);
  if (!contrastButton && !filtersButton && !themeButtons.length) return false;

  let contrastEnabled = false;
  let lightEnabled = false;
  try {
    contrastEnabled = storage.getItem(CONTRAST_PREFERENCE_KEY) === 'true';
    lightEnabled = storage.getItem(THEME_PREFERENCE_KEY) === 'true';
  } catch {
    // Storage may be unavailable in privacy modes; the control still works.
  }
  applyTheme(documentRef, lightEnabled);
  if (contrastButton) applyContrast(documentRef, contrastEnabled);
  if (filtersButton) applyFilterVisibility(documentRef, true);

  contrastButton?.addEventListener('click', () => {
    contrastEnabled = !documentRef.documentElement.hasAttribute('data-high-contrast');
    applyContrast(documentRef, contrastEnabled);
    try {
      storage.setItem(CONTRAST_PREFERENCE_KEY, String(contrastEnabled));
    } catch {
      // Keep the preference for this page load when storage is unavailable.
    }
  });

  themeButtons.forEach((button) => button.addEventListener('click', () => {
    lightEnabled = !documentRef.documentElement.hasAttribute('data-light-theme');
    applyTheme(documentRef, lightEnabled);
    try {
      storage.setItem(THEME_PREFERENCE_KEY, String(lightEnabled));
    } catch {
      // Keep the theme for this page load when storage is unavailable.
    }
  }));

  filtersButton?.addEventListener('click', () => {
    const expanded = filtersButton.getAttribute('aria-expanded') !== 'true';
    applyFilterVisibility(documentRef, expanded);
  });
  return true;
}

if (typeof document !== 'undefined') initializeUiControls();

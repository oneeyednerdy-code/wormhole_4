export const CONTRAST_PREFERENCE_KEY = 'wormhole_high_contrast';
export const THEME_PREFERENCE_KEY = 'wormhole_light_mode';
export const TEXT_SIZE_PREFERENCE_KEY = 'wormhole_text_size';
export const RELAXED_SPACING_PREFERENCE_KEY = 'wormhole_relaxed_spacing';
export const REDUCE_MOTION_PREFERENCE_KEY = 'wormhole_reduce_motion';
export const UNDERLINE_LINKS_PREFERENCE_KEY = 'wormhole_underline_links';
export const SIMPLE_RESULTS_PREFERENCE_KEY = 'wormhole_simple_results';

const ALLOWED_TEXT_SIZES = new Set(['100', '125', '150', '200']);

function getThemeButtons(documentRef) {
  const buttons = documentRef.querySelectorAll?.('[data-theme-toggle]');
  if (buttons?.length) return Array.from(buttons);
  const fallback = documentRef.getElementById('theme-toggle');
  return fallback ? [fallback] : [];
}

function getContrastButtons(documentRef) {
  const buttons = documentRef.querySelectorAll?.('[data-contrast-toggle]');
  if (buttons?.length) return Array.from(buttons);
  const fallback = documentRef.getElementById('contrast-toggle');
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
  root.toggleAttribute('data-high-contrast', enabled);
  body?.classList.toggle('high-contrast', enabled);
  for (const button of getContrastButtons(documentRef)) {
    button.setAttribute('aria-pressed', String(enabled));
    button.textContent = enabled ? 'Standard contrast' : 'High contrast';
  }
}

export function applyAccessibilityPreferences(documentRef, preferences) {
  const root = documentRef.documentElement;
  const textSize = ALLOWED_TEXT_SIZES.has(String(preferences.textSize))
    ? String(preferences.textSize)
    : '100';
  root.setAttribute?.('data-text-scale', textSize);
  root.toggleAttribute('data-relaxed-spacing', Boolean(preferences.relaxedSpacing));
  root.toggleAttribute('data-reduce-motion', Boolean(preferences.reduceMotion));
  root.toggleAttribute('data-underlined-links', Boolean(preferences.underlineLinks));
  root.toggleAttribute('data-simple-results', Boolean(preferences.simpleResults));

  const textSizeControl = documentRef.getElementById('accessibility-text-size');
  if (textSizeControl) textSizeControl.value = textSize;
  const controls = [
    ['accessibility-relaxed-spacing', preferences.relaxedSpacing],
    ['accessibility-reduce-motion', preferences.reduceMotion],
    ['accessibility-underline-links', preferences.underlineLinks],
    ['accessibility-simple-results', preferences.simpleResults],
  ];
  for (const [id, checked] of controls) {
    const control = documentRef.getElementById(id);
    if (control) control.checked = Boolean(checked);
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
  const contrastButtons = getContrastButtons(documentRef);
  const filtersButton = documentRef.getElementById('filters-toggle');
  const themeButtons = getThemeButtons(documentRef);
  if (!contrastButtons.length && !filtersButton && !themeButtons.length) return false;

  let contrastEnabled = false;
  let lightEnabled = false;
  let preferences = {
    textSize: '100',
    relaxedSpacing: false,
    reduceMotion: false,
    underlineLinks: false,
    simpleResults: false,
  };
  try {
    contrastEnabled = storage.getItem(CONTRAST_PREFERENCE_KEY) === 'true';
    lightEnabled = storage.getItem(THEME_PREFERENCE_KEY) === 'true';
    preferences = {
      textSize: storage.getItem(TEXT_SIZE_PREFERENCE_KEY) || '100',
      relaxedSpacing: storage.getItem(RELAXED_SPACING_PREFERENCE_KEY) === 'true',
      reduceMotion: storage.getItem(REDUCE_MOTION_PREFERENCE_KEY) === 'true',
      underlineLinks: storage.getItem(UNDERLINE_LINKS_PREFERENCE_KEY) === 'true',
      simpleResults: storage.getItem(SIMPLE_RESULTS_PREFERENCE_KEY) === 'true',
    };
  } catch {
    // Storage may be unavailable in privacy modes; the control still works.
  }
  applyTheme(documentRef, lightEnabled);
  if (contrastButtons.length) applyContrast(documentRef, contrastEnabled);
  applyAccessibilityPreferences(documentRef, preferences);
  const deviceLayout = documentRef.documentElement.dataset?.deviceLayout;
  const compactLayout = deviceLayout === 'mobile' || deviceLayout === 'tablet';
  if (filtersButton) applyFilterVisibility(documentRef, !compactLayout);

  contrastButtons.forEach((button) => button.addEventListener('click', () => {
      contrastEnabled = !documentRef.documentElement.hasAttribute('data-high-contrast');
      applyContrast(documentRef, contrastEnabled);
      try {
        storage.setItem(CONTRAST_PREFERENCE_KEY, String(contrastEnabled));
      } catch {
        // Keep the preference for this page load when storage is unavailable.
      }
    }));

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

  const saveAccessibilityPreference = (key, value, nextPreferences) => {
    preferences = { ...preferences, ...nextPreferences };
    applyAccessibilityPreferences(documentRef, preferences);
    try {
      storage.setItem(key, String(value));
    } catch {
      // The setting remains active for this page load.
    }
  };

  const textSizeControl = documentRef.getElementById('accessibility-text-size');
  textSizeControl?.addEventListener('change', () => {
    const value = ALLOWED_TEXT_SIZES.has(textSizeControl.value) ? textSizeControl.value : '100';
    saveAccessibilityPreference(TEXT_SIZE_PREFERENCE_KEY, value, { textSize: value });
  });

  for (const [id, key, property] of [
    ['accessibility-relaxed-spacing', RELAXED_SPACING_PREFERENCE_KEY, 'relaxedSpacing'],
    ['accessibility-reduce-motion', REDUCE_MOTION_PREFERENCE_KEY, 'reduceMotion'],
    ['accessibility-underline-links', UNDERLINE_LINKS_PREFERENCE_KEY, 'underlineLinks'],
    ['accessibility-simple-results', SIMPLE_RESULTS_PREFERENCE_KEY, 'simpleResults'],
  ]) {
    const control = documentRef.getElementById(id);
    control?.addEventListener('change', () => {
      saveAccessibilityPreference(key, control.checked, { [property]: control.checked });
    });
  }

  const accessibilityDialog = documentRef.getElementById('accessibility-dialog');
  documentRef.querySelectorAll?.('[data-open-accessibility]').forEach((button) => {
    button.addEventListener('click', () => accessibilityDialog?.showModal?.());
  });
  documentRef.getElementById('accessibility-dialog-close')?.addEventListener('click', () => {
    accessibilityDialog?.close?.();
  });
  return true;
}

if (typeof document !== 'undefined') initializeUiControls();

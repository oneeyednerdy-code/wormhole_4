import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRAST_PREFERENCE_KEY,
  REDUCE_MOTION_PREFERENCE_KEY,
  RELAXED_SPACING_PREFERENCE_KEY,
  SIMPLE_RESULTS_PREFERENCE_KEY,
  TEXT_SIZE_PREFERENCE_KEY,
  THEME_PREFERENCE_KEY,
  UNDERLINE_LINKS_PREFERENCE_KEY,
  applyAccessibilityPreferences,
  applyContrast,
  applyFilterVisibility,
  applyTheme,
  initializeUiControls,
} from '../js/ui-controls.js';

function tokenList() {
  const values = new Set();
  return {
    toggle(name, force) { force ? values.add(name) : values.delete(name); },
    contains(name) { return values.has(name); },
  };
}

function element() {
  const attrs = new Map();
  const listeners = new Map();
  return {
    classList: tokenList(), hidden: false, textContent: '', value: '', checked: false,
    setAttribute(name, value) { attrs.set(name, value); },
    getAttribute(name) { return attrs.get(name) ?? null; },
    addEventListener(type, callback) { listeners.set(type, callback); },
    click() { listeners.get('click')?.(); },
    change() { listeners.get('change')?.(); },
  };
}

function fixture() {
  const elements = {
    'contrast-toggle': element(),
    'login-contrast-toggle': element(),
    'theme-toggle': element(),
    'login-theme-toggle': element(),
    'filters-toggle': element(),
    'filters-panel': element(),
    'filters-content': element(),
    'accessibility-text-size': element(),
    'accessibility-relaxed-spacing': element(),
    'accessibility-reduce-motion': element(),
    'accessibility-underline-links': element(),
    'accessibility-simple-results': element(),
  };
  const rootAttributes = new Set();
  const rootAttributeValues = new Map();
  return {
    elements,
    document: {
      body: element(),
      documentElement: {
        dataset: { deviceLayout: 'desktop' },
        toggleAttribute(name, force) { force ? rootAttributes.add(name) : rootAttributes.delete(name); },
        hasAttribute(name) { return rootAttributes.has(name); },
        setAttribute(name, value) { rootAttributes.add(name); rootAttributeValues.set(name, String(value)); },
        getAttribute(name) { return rootAttributeValues.get(name) ?? null; },
      },
      getElementById(id) { return elements[id] ?? null; },
      querySelectorAll(selector) {
        if (selector === '[data-theme-toggle]') return [elements['theme-toggle'], elements['login-theme-toggle']].filter(Boolean);
        if (selector === '[data-contrast-toggle]') return [elements['contrast-toggle'], elements['login-contrast-toggle']].filter(Boolean);
        return [];
      },
    },
  };
}

test('filter visibility uses both native hidden state and accessible button state', () => {
  const { document, elements } = fixture();
  applyFilterVisibility(document, false);
  assert.equal(elements['filters-content'].hidden, true);
  assert.equal(elements['filters-toggle'].getAttribute('aria-expanded'), 'false');
  assert.equal(elements['filters-toggle'].textContent, 'Show filters');
  assert.equal(elements['filters-panel'].classList.contains('filters-panel--collapsed'), true);
});

test('high contrast updates the root, body, and button label', () => {
  const { document, elements } = fixture();
  applyContrast(document, true);
  assert.equal(document.documentElement.hasAttribute('data-high-contrast'), true);
  assert.equal(document.body.classList.contains('high-contrast'), true);
  assert.equal(elements['contrast-toggle'].getAttribute('aria-pressed'), 'true');
  assert.equal(elements['contrast-toggle'].textContent, 'Standard contrast');
  assert.equal(elements['login-contrast-toggle'].textContent, 'Standard contrast');
});

test('low-vision preferences update document state and form controls', () => {
  const { document, elements } = fixture();
  applyAccessibilityPreferences(document, {
    textSize: '150',
    relaxedSpacing: true,
    reduceMotion: true,
    underlineLinks: true,
    simpleResults: true,
  });
  assert.equal(document.documentElement.getAttribute('data-text-scale'), '150');
  assert.equal(document.documentElement.hasAttribute('data-relaxed-spacing'), true);
  assert.equal(document.documentElement.hasAttribute('data-reduce-motion'), true);
  assert.equal(document.documentElement.hasAttribute('data-underlined-links'), true);
  assert.equal(document.documentElement.hasAttribute('data-simple-results'), true);
  assert.equal(elements['accessibility-text-size'].value, '150');
  assert.equal(elements['accessibility-reduce-motion'].checked, true);
});

test('light mode updates the page and every theme toggle', () => {
  const { document, elements } = fixture();
  applyTheme(document, true);
  assert.equal(document.documentElement.hasAttribute('data-light-theme'), true);
  assert.equal(document.body.classList.contains('light-theme'), true);
  for (const button of [elements['theme-toggle'], elements['login-theme-toggle']]) {
    assert.equal(button.getAttribute('aria-pressed'), 'true');
    assert.equal(button.textContent, 'Dark mode');
  }
});

test('independent controls initialize and respond to clicks', () => {
  const { document, elements } = fixture();
  const stored = new Map([
    [CONTRAST_PREFERENCE_KEY, 'false'],
    [THEME_PREFERENCE_KEY, 'false'],
  ]);
  const storage = { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) };
  assert.equal(initializeUiControls(document, storage), true);
  elements['filters-toggle'].click();
  assert.equal(elements['filters-content'].hidden, true);
  elements['contrast-toggle'].click();
  assert.equal(document.documentElement.hasAttribute('data-high-contrast'), true);
  assert.equal(stored.get(CONTRAST_PREFERENCE_KEY), 'true');
  elements['theme-toggle'].click();
  assert.equal(document.documentElement.hasAttribute('data-light-theme'), true);
  assert.equal(stored.get(THEME_PREFERENCE_KEY), 'true');
  assert.equal(elements['login-theme-toggle'].textContent, 'Dark mode');
});

test('theme controls initialize even when unrelated app controls are absent', () => {
  const { document, elements } = fixture();
  delete elements['contrast-toggle'];
  delete elements['filters-toggle'];
  delete elements['filters-panel'];
  delete elements['filters-content'];
  const stored = new Map([[THEME_PREFERENCE_KEY, 'false']]);
  const storage = { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) };
  assert.equal(initializeUiControls(document, storage), true);
  elements['theme-toggle'].click();
  assert.equal(document.documentElement.hasAttribute('data-light-theme'), true);
});

test('filters start collapsed on automatically detected touch layouts', () => {
  const { document, elements } = fixture();
  document.documentElement.dataset.deviceLayout = 'mobile';
  const storage = { getItem: () => null, setItem: () => {} };
  initializeUiControls(document, storage);
  assert.equal(elements['filters-content'].hidden, true);
  assert.equal(elements['filters-toggle'].getAttribute('aria-expanded'), 'false');
});

test('accessibility form changes persist independently of optional history', () => {
  const { document, elements } = fixture();
  const stored = new Map();
  const storage = { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) };
  initializeUiControls(document, storage);

  elements['accessibility-text-size'].value = '200';
  elements['accessibility-text-size'].change();
  elements['accessibility-relaxed-spacing'].checked = true;
  elements['accessibility-relaxed-spacing'].change();
  elements['accessibility-reduce-motion'].checked = true;
  elements['accessibility-reduce-motion'].change();
  elements['accessibility-underline-links'].checked = true;
  elements['accessibility-underline-links'].change();
  elements['accessibility-simple-results'].checked = true;
  elements['accessibility-simple-results'].change();

  assert.equal(stored.get(TEXT_SIZE_PREFERENCE_KEY), '200');
  assert.equal(stored.get(RELAXED_SPACING_PREFERENCE_KEY), 'true');
  assert.equal(stored.get(REDUCE_MOTION_PREFERENCE_KEY), 'true');
  assert.equal(stored.get(UNDERLINE_LINKS_PREFERENCE_KEY), 'true');
  assert.equal(stored.get(SIMPLE_RESULTS_PREFERENCE_KEY), 'true');
});

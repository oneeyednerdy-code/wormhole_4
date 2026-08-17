import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTRAST_PREFERENCE_KEY,
  applyContrast,
  applyFilterVisibility,
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
    classList: tokenList(), hidden: false, textContent: '',
    setAttribute(name, value) { attrs.set(name, value); },
    getAttribute(name) { return attrs.get(name) ?? null; },
    addEventListener(type, callback) { listeners.set(type, callback); },
    click() { listeners.get('click')?.(); },
  };
}

function fixture() {
  const elements = {
    'contrast-toggle': element(),
    'filters-toggle': element(),
    'filters-panel': element(),
    'filters-content': element(),
  };
  const rootAttributes = new Set();
  return {
    elements,
    document: {
      body: element(),
      documentElement: {
        toggleAttribute(name, force) { force ? rootAttributes.add(name) : rootAttributes.delete(name); },
        hasAttribute(name) { return rootAttributes.has(name); },
      },
      getElementById(id) { return elements[id] ?? null; },
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
});

test('independent controls initialize and respond to clicks', () => {
  const { document, elements } = fixture();
  const stored = new Map([[CONTRAST_PREFERENCE_KEY, 'false']]);
  const storage = { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) };
  assert.equal(initializeUiControls(document, storage), true);
  elements['filters-toggle'].click();
  assert.equal(elements['filters-content'].hidden, true);
  elements['contrast-toggle'].click();
  assert.equal(document.documentElement.hasAttribute('data-high-contrast'), true);
  assert.equal(stored.get(CONTRAST_PREFERENCE_KEY), 'true');
});

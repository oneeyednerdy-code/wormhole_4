import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFilterPreset, normalizeFilterPreset, saveFilterPreset } from '../js/filter-preset-storage.js';

test('normalizes unsafe or unsupported filter settings', () => {
  const preset = normalizeFilterPreset({
    viewerTolerance: '900', matchPreset: 'unknown', statuses: ['partner', 'bogus'],
    categories: [{ id: 1, name: 'Game', source: 'manual' }],
  });
  assert.equal(preset.viewerTolerance, '50');
  assert.equal(preset.matchPreset, 'similar');
  assert.deepEqual(preset.statuses, ['partner']);
  assert.deepEqual(preset.categories, [{ id: '1', name: 'Game', source: 'manual' }]);
  assert.equal(preset.openChatOnly, true);
  assert.equal(preset.includeCurrentCategory, true);
});

test('an explicitly disabled restricted-chat filter remains disabled', () => {
  assert.equal(normalizeFilterPreset({ openChatOnly: false }).openChatOnly, false);
});

test('an explicitly disabled live category remains disabled', () => {
  assert.equal(normalizeFilterPreset({ includeCurrentCategory: false }).includeCurrentCategory, false);
});

test('content-label include and exclusion choices are safely normalized', () => {
  assert.deepEqual(normalizeFilterPreset({
    contentLabels: {
      include: ['Gambling', 'bogus'],
      exclude: ['Gambling', 'SexualThemes'],
    },
  }).contentLabels, { include: [], exclude: ['Gambling', 'SexualThemes'] });
});

test('saves and reloads one explicit local filter preset', () => {
  const data = new Map();
  const storage = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  saveFilterPreset({ viewerTolerance: '75', matchPreset: 'growth', openChatOnly: true }, storage);
  assert.equal(loadFilterPreset(storage).viewerTolerance, '75');
  assert.equal(loadFilterPreset(storage).matchPreset, 'growth');
  assert.equal(loadFilterPreset(storage).openChatOnly, true);
});

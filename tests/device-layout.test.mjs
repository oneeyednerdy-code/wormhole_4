import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyDeviceLayout,
  detectDeviceLayout,
  DEVICE_LAYOUTS,
  normalizeLayoutOverride,
} from '../js/device-layout.js';

test('phones automatically receive the mobile layout', () => {
  assert.equal(detectDeviceLayout({ width: 390 }), DEVICE_LAYOUTS.MOBILE);
  assert.equal(detectDeviceLayout({ width: 360 }), DEVICE_LAYOUTS.MOBILE);
});

test('layout overrides accept auto and known layouts only', () => {
  assert.equal(normalizeLayoutOverride('auto'), 'auto');
  assert.equal(normalizeLayoutOverride('mobile'), 'mobile');
  assert.equal(normalizeLayoutOverride('sideways'), 'auto');
});

test('tablets are recognized by viewport or touch input', () => {
  assert.equal(detectDeviceLayout({ width: 820 }), DEVICE_LAYOUTS.TABLET);
  assert.equal(
    detectDeviceLayout({ width: 1366, maxTouchPoints: 5, coarsePointer: true }),
    DEVICE_LAYOUTS.TABLET
  );
});

test('wide non-touch screens retain the desktop layout', () => {
  assert.equal(
    detectDeviceLayout({ width: 1440, maxTouchPoints: 0, coarsePointer: false }),
    DEVICE_LAYOUTS.DESKTOP
  );
});

test('applying a layout updates the root and touch class', () => {
  const classes = new Set();
  const documentRef = {
    documentElement: { dataset: {} },
    body: { classList: { toggle: (name, force) => force ? classes.add(name) : classes.delete(name) } },
  };
  assert.equal(applyDeviceLayout(documentRef, DEVICE_LAYOUTS.MOBILE), DEVICE_LAYOUTS.MOBILE);
  assert.equal(documentRef.documentElement.dataset.deviceLayout, DEVICE_LAYOUTS.MOBILE);
  assert.equal(classes.has('touch-layout'), true);
});

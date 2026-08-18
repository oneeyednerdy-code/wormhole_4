export const DEVICE_LAYOUTS = Object.freeze({
  MOBILE: 'mobile',
  TABLET: 'tablet',
  DESKTOP: 'desktop',
});
export const LAYOUT_OVERRIDE_KEY = 'wormhole:layout-override';

export function normalizeLayoutOverride(value) {
  return value === 'auto' || Object.values(DEVICE_LAYOUTS).includes(value) ? value : 'auto';
}

export function detectDeviceLayout({
  width = 0,
  maxTouchPoints = 0,
  coarsePointer = false,
} = {}) {
  const viewportWidth = Number(width) || 0;
  if (viewportWidth > 0 && viewportWidth <= 600) return DEVICE_LAYOUTS.MOBILE;
  if (
    (viewportWidth > 0 && viewportWidth <= 1024) ||
    ((coarsePointer || maxTouchPoints > 1) && viewportWidth > 0 && viewportWidth <= 1366)
  ) {
    return DEVICE_LAYOUTS.TABLET;
  }
  return DEVICE_LAYOUTS.DESKTOP;
}

export function applyDeviceLayout(documentRef, layout) {
  const safeLayout = Object.values(DEVICE_LAYOUTS).includes(layout)
    ? layout
    : DEVICE_LAYOUTS.DESKTOP;
  documentRef.documentElement.dataset.deviceLayout = safeLayout;
  documentRef.body?.classList.toggle('touch-layout', safeLayout !== DEVICE_LAYOUTS.DESKTOP);
  return safeLayout;
}

export function initializeDeviceLayout(windowRef = window, documentRef = document, storage = windowRef.localStorage) {
  const pointerQuery = windowRef.matchMedia?.('(hover: none) and (pointer: coarse)');
  let override = 'auto';
  try { override = normalizeLayoutOverride(storage?.getItem(LAYOUT_OVERRIDE_KEY)); } catch {}
  const detect = () => detectDeviceLayout({
    width: windowRef.innerWidth,
    maxTouchPoints: windowRef.navigator?.maxTouchPoints ?? 0,
    coarsePointer: Boolean(pointerQuery?.matches),
  });
  const update = () => applyDeviceLayout(documentRef, override === 'auto' ? detect() : override);

  const select = documentRef.getElementById?.('layout-override');
  if (select) {
    select.value = override;
    select.addEventListener('change', () => {
      override = normalizeLayoutOverride(select.value);
      try { storage?.setItem(LAYOUT_OVERRIDE_KEY, override); } catch {}
      update();
    });
  }

  update();
  windowRef.addEventListener?.('resize', update, { passive: true });
  pointerQuery?.addEventListener?.('change', update);
  return update;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initializeDeviceLayout();
}

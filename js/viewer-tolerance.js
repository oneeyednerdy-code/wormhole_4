export const VIEWER_TOLERANCE_OPTIONS = [50, 75, 100, null];

export const VIEWER_RANGE_NAMES = Object.freeze({
  50: 'Similar audience',
  75: 'Wider audience',
  100: 'Broad audience',
  all: 'Any audience size',
});

export function parseViewerTolerance(value) {
  if (value === null || value === 'all') return null;
  const tolerance = Number(value);
  return [50, 75, 100].includes(tolerance) ? tolerance : 50;
}

export function calculateViewerRange(viewerCount, tolerancePercent) {
  if (tolerancePercent === null) return null;
  const viewers = Math.max(0, Number(viewerCount) || 0);
  const tolerance = parseViewerTolerance(tolerancePercent) / 100;
  return {
    min: Math.max(0, Math.floor(viewers * (1 - tolerance))),
    max: Math.ceil(viewers * (1 + tolerance)),
  };
}

export function describeViewerRange(viewerCount, tolerancePercent) {
  const tolerance = parseViewerTolerance(tolerancePercent);
  if (tolerance === null) {
    return {
      name: VIEWER_RANGE_NAMES.all,
      rangeText: 'No viewer limit',
      description: 'No viewer-count restriction',
      chipText: 'Audience: Any size',
      range: null,
    };
  }

  const numericViewerCount = Number(viewerCount);
  const hasBaseline = Number.isFinite(numericViewerCount) && numericViewerCount >= 0;
  const name = VIEWER_RANGE_NAMES[tolerance];
  if (!hasBaseline) {
    return {
      name,
      rangeText: `±${tolerance}% when available`,
      description: `Uses a ±${tolerance}% range after a viewer baseline is available`,
      chipText: `Audience: ${name.replace(' audience', '')} · ±${tolerance}%`,
      range: null,
    };
  }

  const baseline = Math.round(numericViewerCount);
  const range = calculateViewerRange(baseline, tolerance);
  const description = tolerance === 100
    ? `From zero to twice your current audience of ${baseline} viewers`
    : `Within ±${tolerance}% of your current audience of ${baseline} viewers`;

  return {
    name,
    rangeText: `${range.min} to ${range.max} viewers`,
    description,
    chipText: `Audience: ${name.replace(' audience', '')} · ${range.min} to ${range.max} viewers`,
    range,
  };
}

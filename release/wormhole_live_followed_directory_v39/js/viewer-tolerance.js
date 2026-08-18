export const VIEWER_TOLERANCE_OPTIONS = [50, 75, 100, null];

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

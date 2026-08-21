export function fmtNumber(n) {
  return new Intl.NumberFormat().format(Math.round(n));
}

export function fmtDuration(ms) {
  const totalMinutes = Math.floor(ms / 1000 / 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function fmtDate(value, options = { dateStyle: 'medium' }) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Unknown'
    : new Intl.DateTimeFormat(undefined, options).format(date);
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

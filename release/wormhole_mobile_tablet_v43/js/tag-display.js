import { isLanguageTag } from './language-tags.js?v=43';

/** Creates a compact, deduplicated tag list for result cards. */
export function prepareTagDisplay(tags, sharedTags = []) {
  const sharedKeys = new Set(
    sharedTags.map((tag) => String(tag ?? '').trim().toLowerCase()).filter(Boolean)
  );
  const seen = new Set();
  const display = [];
  for (const value of tags ?? []) {
    const label = String(value ?? '').trim();
    const key = label.toLowerCase();
    if (!label || seen.has(key)) continue;
    seen.add(key);
    display.push({
      label,
      shared: sharedKeys.has(key),
      language: isLanguageTag(label),
    });
  }
  return display;
}

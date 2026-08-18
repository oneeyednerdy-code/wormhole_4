import { isLanguageTag } from './language-tags.js?v=69';

/** Creates a compact, deduplicated tag list for result cards. */
export function prepareTagDisplay(tags, sharedTags = [], searchedTags = []) {
  const sharedKeys = new Set(
    sharedTags.map((tag) => String(tag ?? '').trim().toLowerCase()).filter(Boolean)
  );
  const searchedKeys = new Set(
    searchedTags.map((tag) => String(tag ?? '').trim().toLowerCase()).filter(Boolean)
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
      searched: searchedKeys.has(key),
      language: isLanguageTag(label),
    });
  }
  return display.sort((first, second) => {
    const firstPriority = Number(first.shared) + (Number(first.searched) * 2);
    const secondPriority = Number(second.shared) + (Number(second.searched) * 2);
    return secondPriority - firstPriority;
  });
}

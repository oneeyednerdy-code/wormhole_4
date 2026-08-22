import { isLanguageTag } from './language-tags.js?v=91';

/** Twitch tags are compared without case, spaces, punctuation, or hash prefixes. */
export function normalizeTagKey(tag) {
  return String(tag ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/&/g, 'and')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function getSearchedTagMatch(tags = [], searchedTags = []) {
  const streamKeys = new Set(tags.map(normalizeTagKey).filter(Boolean));
  const searched = [...new Set(searchedTags.map(normalizeTagKey).filter(Boolean))];
  const matched = searched.filter((key) => streamKeys.has(key));
  return {
    searchedTagMatchCount: matched.length,
    searchedTagMatchPercent: searched.length ? (matched.length / searched.length) * 100 : 0,
  };
}

/** Creates a compact, deduplicated tag list for result cards. */
export function prepareTagDisplay(tags, sharedTags = [], searchedTags = []) {
  const sharedKeys = new Set(
    sharedTags.map(normalizeTagKey).filter(Boolean)
  );
  const searchedKeys = new Set(
    searchedTags.map(normalizeTagKey).filter(Boolean)
  );
  const seen = new Set();
  const display = [];
  for (const value of tags ?? []) {
    const label = String(value ?? '').trim();
    const key = normalizeTagKey(label);
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

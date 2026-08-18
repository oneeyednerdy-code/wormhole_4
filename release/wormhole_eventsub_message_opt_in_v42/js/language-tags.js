export const POPULAR_LANGUAGE_TAGS = Object.freeze([
  'English',
  'Spanish',
  'German',
  'French',
  'Portuguese',
  'Japanese',
  'Korean',
  'Russian',
  'Italian',
  'Polish',
  'Turkish',
  'Arabic',
  'Chinese',
]);

const LANGUAGE_TAG_KEYS = new Set(POPULAR_LANGUAGE_TAGS.map((tag) => tag.toLowerCase()));

export function parseTagInput(value) {
  const seen = new Set();
  return String(value ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function isLanguageTag(tag) {
  return LANGUAGE_TAG_KEYS.has(String(tag ?? '').trim().toLowerCase());
}

/** Replaces supported language tags while preserving every unrelated tag. */
export function applyLanguageTag(currentValue, selectedLanguage) {
  const tags = parseTagInput(currentValue).filter((tag) => !isLanguageTag(tag));
  const selected = POPULAR_LANGUAGE_TAGS.find(
    (tag) => tag.toLowerCase() === String(selectedLanguage ?? '').toLowerCase()
  );
  if (selected) tags.push(selected);
  return tags.join(', ');
}

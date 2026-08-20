export const CONTENT_FILTER_LABELS = Object.freeze([
  { id: 'MatureAudience', label: 'Mature audience setting' },
  { id: 'DebatedSocialIssuesAndPolitics', label: 'Politics and sensitive social issues' },
  { id: 'DrugsIntoxication', label: 'Drugs or intoxication' },
  { id: 'SexualThemes', label: 'Sexual themes' },
  { id: 'ViolentGraphic', label: 'Graphic violence' },
  { id: 'Gambling', label: 'Gambling' },
  { id: 'ProfanityVulgarity', label: 'Profanity or vulgarity' },
  { id: 'MatureGame', label: 'Mature-rated game' },
]);

const ALLOWED_IDS = new Set(CONTENT_FILTER_LABELS.map((item) => item.id));

function cleanIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(String))]
    .filter((id) => ALLOWED_IDS.has(id));
}

export function normalizeContentLabelFilter(value = {}) {
  const include = cleanIds(value.include);
  const excluded = new Set(cleanIds(value.exclude));
  return {
    include: include.filter((id) => !excluded.has(id)),
    exclude: [...excluded],
  };
}

export function getStreamContentLabels(stream = {}) {
  const labels = new Set(
    (stream.content_classification_labels ?? []).map(String).filter((id) => ALLOWED_IDS.has(id))
  );
  if (stream.is_mature === true) labels.add('MatureAudience');
  return labels;
}

/** Required labels use ANY matching; excluded labels always remove a stream. */
export function filterStreamsByContentLabels(streams, value = {}) {
  const { include, exclude } = normalizeContentLabelFilter(value);
  if (!include.length && !exclude.length) return [...(streams ?? [])];
  return (streams ?? []).filter((stream) => {
    const labels = getStreamContentLabels(stream);
    if (exclude.some((id) => labels.has(id))) return false;
    return !include.length || include.some((id) => labels.has(id));
  });
}

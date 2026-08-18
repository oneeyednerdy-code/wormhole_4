/**
 * Resolves where discovery candidates come from.
 * Following Only intentionally bypasses all game/category constraints so the
 * caller can filter the complete followed-live directory by tags and the
 * remaining active filters.
 */
export function resolveDiscoveryMode({
  onlyFollowing = false,
  primaryGameId = '',
  extraCategories = [],
} = {}) {
  const selectedIndividualGameIds = [
    primaryGameId,
    ...extraCategories
      .filter((category) => category.source !== 'genre')
      .map((category) => category.id),
  ].filter(Boolean);
  const selectedGenreGameIds = extraCategories
    .filter((category) => category.source === 'genre')
    .map((category) => category.id)
    .filter(Boolean);

  if (onlyFollowing) {
    return {
      individualGameIds: [],
      genreGameIds: [],
      categoryMatchApplied: false,
      useFollowedStreamsEndpoint: true,
    };
  }

  return {
    individualGameIds: selectedIndividualGameIds,
    genreGameIds: selectedGenreGameIds,
    categoryMatchApplied:
      selectedIndividualGameIds.length > 0 || selectedGenreGameIds.length > 0,
    useFollowedStreamsEndpoint: false,
  };
}

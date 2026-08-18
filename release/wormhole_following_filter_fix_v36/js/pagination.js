export const PAGE_SIZE_OPTIONS = [12, 24, 36, 48, 60, 72, 84, 96, 100];

export function paginate(items, requestedPage, requestedPageSize) {
  const pageSize = PAGE_SIZE_OPTIONS.includes(Number(requestedPageSize))
    ? Number(requestedPageSize)
    : PAGE_SIZE_OPTIONS[0];
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(Math.max(1, Number(requestedPage) || 1), pageCount);
  const startIndex = (page - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, items.length);

  return {
    page,
    pageSize,
    pageCount,
    startIndex,
    endIndex,
    items: items.slice(startIndex, endIndex),
  };
}

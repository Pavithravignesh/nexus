// Client-side paging for in-memory lists (devices, alerts, feed). Pure, so it is unit tested
// and every list pages the same way.

export const PAGE_SIZES = [10, 25, 50, 100, 250] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

export type Page<T> = {
  items: T[];
  /** 0-based page actually shown (clamped into range). */
  page: number;
  pages: number;
  /** 1-based index of the first and last item shown; 0 when empty. */
  from: number;
  to: number;
  total: number;
};

export function paginate<T>(all: readonly T[], page: number, size: number): Page<T> {
  const total = all.length;
  const perPage = Math.max(1, Math.floor(size));
  const pages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(0, Math.floor(page)), pages - 1);
  const start = current * perPage;
  const items = all.slice(start, start + perPage);
  return { items, page: current, pages, from: items.length ? start + 1 : 0, to: start + items.length, total };
}

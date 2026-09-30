"use client";

import { PAGE_SIZES, type Page } from "@/lib/pagination";

type Props = {
  page: Pick<Page<unknown>, "page" | "pages" | "from" | "to" | "total">;
  size: number;
  sizes?: readonly number[];
  label: string;
  onPage: (page: number) => void;
  onSize: (size: number) => void;
};

const btn = "border border-border px-2 py-0.5 hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-35";

/** Shared pager: "showing a–b of N", page size, first / previous / page x of y / next / last. */
export function Pagination({ page, size, sizes = PAGE_SIZES, label, onPage, onSize }: Props): React.JSX.Element {
  const first = page.page === 0;
  const last = page.page >= page.pages - 1;
  return (
    <nav aria-label={`${label} pages`} className="num flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-[11px] text-muted">
      <span aria-live="polite">
        {page.total === 0 ? "No results" : `Showing ${page.from.toLocaleString("en-US")}–${page.to.toLocaleString("en-US")} of ${page.total.toLocaleString("en-US")}`}
      </span>
      <span className="flex items-center gap-1.5">
        <label className="flex items-center gap-1">
          <span>Rows</span>
          <select value={size} onChange={(e) => onSize(Number(e.target.value))} aria-label={`${label} rows per page`} className="border border-border bg-surface px-1 py-0.5 text-[var(--text)]">
            {sizes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={btn} disabled={first} onClick={() => onPage(0)} aria-label="First page">
          «
        </button>
        <button type="button" className={btn} disabled={first} onClick={() => onPage(page.page - 1)} aria-label="Previous page">
          ‹
        </button>
        <span className="px-1 text-[var(--text)]">
          {page.page + 1} / {page.pages}
        </span>
        <button type="button" className={btn} disabled={last} onClick={() => onPage(page.page + 1)} aria-label="Next page">
          ›
        </button>
        <button type="button" className={btn} disabled={last} onClick={() => onPage(page.pages - 1)} aria-label="Last page">
          »
        </button>
      </span>
    </nav>
  );
}

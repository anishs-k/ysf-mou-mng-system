/**
 * Purpose: The footer pager of the API-paged tables (Existing Companies, Agreement
 * History). GET /api/search answers one page plus the match total, so these
 * screens show "Page x of y" with Previous / Next in the design's ghost-button
 * style instead of the prototype's all-rows-at-once table.
 */

const GHOST_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground px-3 py-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed";

interface PagerProps {
  readonly page: number;
  readonly total: number;
  readonly pageSize: number;
  readonly onPage: (page: number) => void;
  /** Optional left-hand caption, e.g. "1–25 of 366 agreements". */
  readonly caption?: string;
}

function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function Pager({ page, total, pageSize, onPage, caption }: PagerProps) {
  const pages = pageCount(total, pageSize);
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-border">
      <p className="text-xs text-muted-foreground">{caption}</p>
      <div className="flex items-center gap-2">
        <button type="button" className={GHOST_BUTTON} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <span className="text-xs font-semibold text-muted-foreground mono">
          Page {page} of {pages}
        </span>
        <button type="button" className={GHOST_BUTTON} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}

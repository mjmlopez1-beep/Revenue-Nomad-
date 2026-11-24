"use client";

/**
 * Click a column header to sort, one piece for every data table in the app.
 *
 *   const s = useSort(rows, [{ key: "name" }, { key: "rate", kind: "money", get: (r) => r.rate }], { storageKey: "contracts" });
 *   <th> -> <SortHeader s={s} k="name">Name</SortHeader>          (a role="columnheader" grid: as="div")
 *   s.rows                                                            the rows in the order to draw
 *
 * A first click sorts the way people expect (text A to Z, numbers and money high to low, dates
 * newest first); a second click on the same header reverses it. Blanks and locked values go last
 * both ways, and a sort never reads a value the screen doesn't show: a column's `get` returns null
 * for anything locked or hidden. Ties keep the order the rows came in (the list's own sort), so the
 * sort is stable. The choice is remembered per table in this browser (localStorage, best effort).
 *
 * The compare and sort functions are pure, in sortCore.ts (re-exported here), for scripts/test-sort.mts.
 * Its styles are sortable.css, loaded once from app/layout.tsx.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { sorterOf, type SortDir, type SortState, type SortStore, type Sorter, type SortCol } from "./sortCore";

export * from "./sortCore";

const STORE = "rn.sort.";
function readStored(storageKey: string | undefined): SortState | null {
  if (!storageKey || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORE + storageKey);
    if (!raw) return null;
    const x = JSON.parse(raw) as Partial<SortState>;
    return typeof x?.key === "string" && (x.dir === "asc" || x.dir === "desc") ? { key: x.key, dir: x.dir } : null;
  } catch {
    return null;
  }
}
function writeStored(storageKey: string | undefined, s: SortState | null) {
  if (!storageKey || typeof window === "undefined") return;
  try {
    if (s) window.localStorage.setItem(STORE + storageKey, JSON.stringify(s));
    else window.localStorage.removeItem(STORE + storageKey);
  } catch {
    /* private window or blocked storage: the sort still works, it just isn't remembered */
  }
}


/**
 * The state alone, for a page that draws its table from a plain function (call it before any
 * early return, then sorterOf in the drawing). The remembered choice is read after the first
 * paint, so the server's and the browser's first draw agree.
 */
export function useSortState(storageKey?: string): SortStore {
  const [state, setState] = useState<SortState | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const s = readStored(storageKey);
    if (s) setState(s);
    setLoaded(true);
  }, [storageKey]);
  const set = useCallback(
    (s: SortState | null) => {
      setState(s);
      if (loaded || s) writeStored(storageKey, s);
    },
    [storageKey, loaded],
  );
  return useMemo(() => ({ state, set }), [state, set]);
}


/**
 * Sort rows by a clicked header. `defaultKey` (and `defaultDir`) is the sort before any click;
 * without it the rows keep the order given. `storageKey` remembers the choice for this table.
 * Keep `columns` stable (a module constant or useMemo): the sort runs again when it changes.
 */
export function useSort<T>(rows: readonly T[], columns: readonly SortCol<T>[], opts: { defaultKey?: string | null; defaultDir?: SortDir; storageKey?: string } = {}): Sorter<T> {
  const store = useSortState(opts.storageKey);
  const { defaultKey = null, defaultDir } = opts;
  return useMemo(() => sorterOf(rows, columns, store, { defaultKey, defaultDir }), [rows, columns, store, defaultKey, defaultDir]);
}

/**
 * A header that sorts: a real button inside the <th> (or the grid's role="columnheader" cell),
 * aria-sort on the header while it sorts, an arrow on the column in use and a faint one on hover.
 * Without a sorter, or for a column it can't sort, it draws the plain header.
 */
export function SortHeader({
  s,
  k,
  children,
  as = "th",
  className,
  title,
  extra,
  style,
  colSpan,
  rowSpan,
}: {
  s: Pick<Sorter<unknown>, "toggle" | "can" | "ariaOf" | "key" | "dir"> | null | undefined;
  /** The column's key. */
  k: string;
  children: ReactNode;
  /** "th" for a table, "div" or "span" for a role="columnheader" grid cell. */
  as?: "th" | "div" | "span";
  className?: string;
  title?: string;
  /** Drawn after the button inside the header (a "?" tip, a link). */
  extra?: ReactNode;
  style?: React.CSSProperties;
  colSpan?: number;
  rowSpan?: number;
}) {
  const on = !!s && s.key === k;
  const sortable = !!s && s.can(k);
  const aria = sortable ? s!.ariaOf(k) : undefined;
  const label = typeof children === "string" ? children : undefined;
  const inner = sortable ? (
    <button type="button" className={`sh-btn${on ? " on" : ""}`} onClick={() => s!.toggle(k)} title={title ? `${title}. Sort by this column.` : label ? `Sort by ${label.toLowerCase()}` : "Sort by this column"}>
      <span className="sh-l">{children}</span>
      <svg className={`sh-arrow${on && s!.dir === "asc" ? " up" : ""}`} width="10" height="10" viewBox="0 0 10 10" aria-hidden focusable="false">
        <path d="M5 8.5 1.5 4h7z" fill="currentColor" />
      </svg>
    </button>
  ) : (
    children
  );
  const cls = `sh${sortable ? " sh-on" : ""}${on ? " sh-active" : ""}${className ? ` ${className}` : ""}`;
  if (as !== "th") {
    const Tag = as;
    return (
      <Tag role="columnheader" aria-sort={aria} className={cls} title={sortable ? undefined : title} style={style}>
        {inner}
        {extra}
      </Tag>
    );
  }
  return (
    <th scope="col" aria-sort={aria} className={cls} title={sortable ? undefined : title} style={style} colSpan={colSpan} rowSpan={rowSpan}>
      {inner}
      {extra}
    </th>
  );
}

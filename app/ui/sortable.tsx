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
 * The compare and sort functions are pure and exported for scripts/test-sort.mts.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { readRate } from "@/lib/rates";
import "./sortable.css";

export type SortKind = "text" | "number" | "money" | "date";
export type SortDir = "asc" | "desc";
/** null or undefined: a blank or a locked value, always last. */
export type SortVal = string | number | boolean | null | undefined;

export interface SortCol<T> {
  key: string;
  /** "text" by default. */
  kind?: SortKind;
  /** The value the row shows in this column, or null when it is blank, locked or hidden. Default: row[key]. */
  get?: (row: T) => SortVal;
  /** The header's words, for the "Sort" menu's line ("Rate, high to low"). */
  label?: string;
}
export interface SortState {
  key: string;
  dir: SortDir;
}

/** The first click's direction: text A to Z, everything else highest or newest first. */
export const firstDir = (kind: SortKind = "text"): SortDir => (kind === "text" ? "asc" : "desc");

/** "8k" 8000, "$1.5M" 1500000, "1,200" 1200, "51-200" 51; null when there is no number. */
export function numberOf(v: SortVal): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  const m = /(-?\d+(?:\.\d+)?)\s*([kmb])?(?![a-z])/i.exec(v.replace(/,/g, ""));
  if (!m) return null;
  const s = m[2]?.toLowerCase();
  return Number(m[1]) * (s === "k" ? 1e3 : s === "m" ? 1e6 : s === "b" ? 1e9 : 1);
}

/**
 * Money as one scale: what it comes to an hour, so "$150/hr" and "$9,000/mo" sort together
 * (a monthly retainer over about 60 hours, as lib/billing/rules.ts hourlyOf reads it). A figure
 * lib/rates.ts can't read as a rate (a project fee, a price) sorts by its number.
 */
export function moneyOf(v: SortVal): number | null {
  if (typeof v !== "string") return numberOf(v);
  const r = readRate(v);
  if (r) return r.kind === "hourly" ? r.amount : r.amount / 60;
  return numberOf(v);
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** A time in ms from an ISO date, "2024-03", "Mar 2024", "Nov 21, 2025" or ms; null when it isn't a date. */
export function dateOf(v: SortVal): number | null {
  if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = v.trim();
  let m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/.exec(t);
  if (m && !/^\d{4}\d/.test(t)) {
    const iso = Date.parse(t);
    if (t.length > 10 && Number.isFinite(iso)) return iso;
    return Date.UTC(Number(m[1]), m[2] ? Number(m[2]) - 1 : 0, m[3] ? Number(m[3]) : 1);
  }
  m = /^([a-z]{3})[a-z]*\.?\s+(?:(\d{1,2}),?\s+)?(\d{4})$/i.exec(t);
  if (m && MONTHS.includes(m[1].toLowerCase())) return Date.UTC(Number(m[3]), MONTHS.indexOf(m[1].toLowerCase()), m[2] ? Number(m[2]) : 1);
  const p = Date.parse(t);
  return Number.isFinite(p) ? p : null;
}

/** A value as the kind sorts it: a number for numbers, money and dates, trimmed text for text; null for a blank. */
export function sortValue(v: SortVal, kind: SortKind = "text"): string | number | null {
  if (kind === "number") return numberOf(v);
  if (kind === "money") return moneyOf(v);
  if (kind === "date") return dateOf(v);
  if (v === null || v === undefined || typeof v === "boolean") return v === true ? "Yes" : v === false ? "No" : null;
  const s = String(v).trim();
  return s ? s : null;
}

const collator = typeof Intl !== "undefined" ? new Intl.Collator("en-US", { numeric: true, sensitivity: "base" }) : null;

/** Compare two values for a direction. Blanks are last whichever way the column sorts. */
export function compareSort(a: SortVal, b: SortVal, kind: SortKind = "text", dir: SortDir = firstDir(kind)): number {
  const x = sortValue(a, kind);
  const y = sortValue(b, kind);
  if (x === null || y === null) return x === null ? (y === null ? 0 : 1) : -1;
  const c = typeof x === "number" && typeof y === "number" ? x - y : collator ? collator.compare(String(x), String(y)) : String(x).localeCompare(String(y));
  return dir === "asc" ? c : -c;
}

const getterOf = <T,>(col: SortCol<T>) => col.get ?? ((r: T) => (r as Record<string, SortVal> | null)?.[col.key]);

/** The rows sorted by one column, stable: ties keep the order they came in. A new array. */
export function sortByCol<T>(rows: readonly T[], col: SortCol<T>, dir: SortDir): T[] {
  const get = getterOf(col);
  const kind = col.kind ?? "text";
  return rows
    .map((r, n) => ({ r, n, v: get(r) }))
    .sort((a, b) => compareSort(a.v, b.v, kind, dir) || a.n - b.n)
    .map((x) => x.r);
}

/** How a sort reads in words: "A to Z", "High to low", "Newest first". */
export function dirWords(kind: SortKind = "text", dir: SortDir): string {
  if (kind === "text") return dir === "asc" ? "A to Z" : "Z to A";
  if (kind === "date") return dir === "desc" ? "Newest first" : "Oldest first";
  return dir === "desc" ? "High to low" : "Low to high";
}

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

export interface Sorter<T> {
  /** The rows in the order to draw them (the rows as given while no column sorts). */
  rows: T[];
  /** The column that sorts, or null for the list's own order. */
  key: string | null;
  dir: SortDir;
  /** A click on a header: its first direction, or the other way when it already sorts. */
  toggle: (key: string) => void;
  set: (s: SortState | null) => void;
  /** Back to the list's own order (a "Sort by" menu pick clears the header's sort). */
  clear: () => void;
  /** This column can sort (it is in the columns given). */
  can: (key: string) => boolean;
  /** aria-sort for a header. */
  ariaOf: (key: string) => "ascending" | "descending" | undefined;
  /** "Rate, high to low" while a header sorts, else null. */
  words: string | null;
}

/** The header sort a table keeps: the member's pick (null: none yet), remembered for the table. */
export interface SortStore {
  state: SortState | null;
  set: (s: SortState | null) => void;
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
 * The rows sorted by the store's column (or the default before any pick), with the header's
 * controls. Pure apart from the store's set. A remembered column the table no longer has is ignored.
 */
export function sorterOf<T>(rows: readonly T[], columns: readonly SortCol<T>[], store: SortStore, opts: { defaultKey?: string | null; defaultDir?: SortDir } = {}): Sorter<T> {
  const colOf = (k: string | null | undefined) => (k ? columns.find((c) => c.key === k) : undefined);
  const d = colOf(opts.defaultKey);
  const live: SortState | null = store.state && colOf(store.state.key) ? store.state : d ? { key: d.key, dir: opts.defaultDir ?? firstDir(d.kind) } : null;
  const col = colOf(live?.key);
  return {
    rows: col && live ? sortByCol(rows, col, live.dir) : [...rows],
    key: live?.key ?? null,
    dir: live?.dir ?? "asc",
    toggle: (key) => {
      const c = colOf(key);
      if (!c) return;
      store.set({ key, dir: live && live.key === key ? (live.dir === "asc" ? "desc" : "asc") : firstDir(c.kind) });
    },
    set: store.set,
    clear: () => store.set(null),
    can: (k) => !!colOf(k),
    ariaOf: (k) => (live && live.key === k ? (live.dir === "asc" ? "ascending" : "descending") : undefined),
    words: col && live ? `${col.label ?? col.key}, ${dirWords(col.kind, live.dir).toLowerCase()}` : null,
  };
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
  /** "th" for a table, "div" for a role="columnheader" grid cell. */
  as?: "th" | "div";
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
  if (as === "div")
    return (
      <div role="columnheader" aria-sort={aria} className={cls} title={sortable ? undefined : title} style={style}>
        {inner}
        {extra}
      </div>
    );
  return (
    <th scope="col" aria-sort={aria} className={cls} title={sortable ? undefined : title} style={style} colSpan={colSpan} rowSpan={rowSpan}>
      {inner}
      {extra}
    </th>
  );
}

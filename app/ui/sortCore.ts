/**
 * The pure half of click-to-sort (app/ui/sortable.tsx has the hooks and the header): how values
 * compare by kind, blanks and locks last both ways, the stable sort, the words, and the sorter a
 * header drives. No React and no CSS, so scripts/test-sort.mts reads it as the tables do.
 */
import { readRate } from "@/lib/rates";

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

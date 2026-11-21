/**
 * Fractionals, the directory's filters and order, as pure data (app/post/Fractionals.tsx draws them;
 * scripts/test-fractionals.mts checks them with no browser). Every record comes from the server
 * already locked as the member may see it (lib/fractionals.ts): this file only narrows and sorts.
 *
 *  - Tabs: All, On Merlin, Unlocked (the member paid for who they are).
 *  - Filters: Serves your Ideal Fractional Profile (on by default, when the member has one),
 *    Function (Any, Different from yours, Same as yours, or one function), Level, On Merlin, Region.
 *  - The line at the top: "N fractionals serve companies like yours. M are on Merlin."
 */
import type { FractionalRec } from "@/lib/tableTypes";
import { LEVELS, levelRank, shortCountry } from "@/lib/fractionalsCore";

/**
 * The address the app opened with, read once when the app's code loads (the table rewrites the
 * address before this page's own code arrives): ?ff=diff (Referral partners' old links), ?fr= a
 * record, ?fs= a seat's record, ?welcome=1&m= after Activate your fractional profile. Used once.
 */
const START = typeof window !== "undefined" ? window.location.search : "";
let startUsed = false;
export function startPlace(): { diff: boolean; rec: string | null; seat: string | null; welcome: boolean; m: string | null } {
  const q = new URLSearchParams(startUsed ? "" : START);
  startUsed = true;
  if (q.get("p") !== "fractionals" && q.get("p") !== "partners") return { diff: false, rec: null, seat: null, welcome: false, m: null };
  return { diff: q.get("ff") === "diff" || q.get("p") === "partners", rec: q.get("fr"), seat: q.get("fs"), welcome: q.get("welcome") === "1", m: q.get("m") };
}

/** A seat to open its fractional's record at (a company record's "See their record"): set before opening the page, taken once by it. */
let wantSeat: string | null = null;
export const openFractionalAt = (seatId: string) => {
  wantSeat = seatId;
};
export const takeWantSeat = () => {
  const s = wantSeat;
  wantSeat = null;
  return s;
};

export type FrTab = "all" | "on" | "unlocked";
export const FR_TABS: { key: FrTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "on", label: "On Merlin" },
  { key: "unlocked", label: "Unlocked" },
];

/** "any", "diff" (different from yours), "same" (same as yours), or one function's name. */
export type FnPick = string;

export interface FrFilters {
  /** Serves your Ideal Fractional Profile. */
  fits: boolean;
  fn: FnPick;
  levels: string[];
  onMerlin: boolean;
  /** Countries, as shortCountry spells them ("US", "UK", "Canada"). */
  regions: string[];
}

export const frDefaults = (hasIcp: boolean, different = false): FrFilters => ({ fits: hasIcp, fn: different ? "diff" : "any", levels: [], onMerlin: false, regions: [] });

/** The functions a record counts for: every function they held seats in, else their lead one. */
const fnsOf = (r: FractionalRec) => (r.fns.length ? r.fns : r.fn ? [r.fn] : []);

export function fnMatches(r: FractionalRec, pick: FnPick, myFn: string | null): boolean {
  if (pick === "any") return true;
  const fns = fnsOf(r);
  if (pick === "diff") return !myFn || (fns.length > 0 && !fns.includes(myFn));
  if (pick === "same") return !!myFn && fns.includes(myFn);
  return fns.includes(pick);
}

const regionsOf = (r: FractionalRec) => (r.clients?.countries ?? []).map(shortCountry);

/** One filter left out (`skip`), for the counts beside its own choices. */
export function passes(r: FractionalRec, f: FrFilters, myFn: string | null, hasIcp: boolean, skip?: keyof FrFilters): boolean {
  if (r.you) return false;
  if (skip !== "fits" && f.fits && hasIcp && !r.fits) return false;
  if (skip !== "fn" && !fnMatches(r, f.fn, myFn)) return false;
  if (skip !== "levels" && f.levels.length && !(r.level && f.levels.includes(r.level))) return false;
  if (skip !== "onMerlin" && f.onMerlin && !r.onMerlin) return false;
  if (skip !== "regions" && f.regions.length && !regionsOf(r).some((x) => f.regions.includes(x))) return false;
  return true;
}

export const inTab = (r: FractionalRec, tab: FrTab) => (tab === "on" ? r.onMerlin : tab === "unlocked" ? !!r.unlocked : true);

/** Best fit for you: fits the profile, on Merlin, current seats, more seats, a higher level, then the name or id (stable). */
export function frOrder(a: FractionalRec, b: FractionalRec): number {
  return (
    Number(b.fits) - Number(a.fits) ||
    Number(b.onMerlin) - Number(a.onMerlin) ||
    Number(b.now > 0) - Number(a.now > 0) ||
    b.now + b.past - (a.now + a.past) ||
    levelRank(a.level as never) - levelRank(b.level as never) ||
    (a.name ?? "~").localeCompare(b.name ?? "~") ||
    a.id.localeCompare(b.id)
  );
}

/** The directory's rows for a tab and filters, in order. */
export function frRows(records: FractionalRec[], tab: FrTab, f: FrFilters, myFn: string | null, hasIcp: boolean): FractionalRec[] {
  return records.filter((r) => inTab(r, tab) && passes(r, f, myFn, hasIcp)).sort(frOrder);
}

/** How many each tab would show with the filters as they are. */
export function tabCounts(records: FractionalRec[], f: FrFilters, myFn: string | null, hasIcp: boolean): Record<FrTab, number> {
  const out: Record<FrTab, number> = { all: 0, on: 0, unlocked: 0 };
  for (const r of records) {
    if (!passes(r, f, myFn, hasIcp)) continue;
    out.all++;
    if (r.onMerlin) out.on++;
    if (r.unlocked) out.unlocked++;
  }
  return out;
}

/** Counts beside each choice of one filter: the other filters on, this one off. */
export function choiceCounts(records: FractionalRec[], f: FrFilters, myFn: string | null, hasIcp: boolean) {
  const fn = new Map<string, number>();
  const level = new Map<string, number>();
  const region = new Map<string, number>();
  let diff = 0;
  let same = 0;
  let fits = 0;
  let onMerlin = 0;
  for (const r of records) {
    if (r.you) continue;
    if (passes(r, f, myFn, hasIcp, "fn")) {
      for (const x of fnsOf(r)) fn.set(x, (fn.get(x) ?? 0) + 1);
      if (fnMatches(r, "diff", myFn)) diff++;
      if (fnMatches(r, "same", myFn)) same++;
    }
    if (passes(r, f, myFn, hasIcp, "levels") && r.level) level.set(r.level, (level.get(r.level) ?? 0) + 1);
    if (passes(r, f, myFn, hasIcp, "regions")) for (const x of new Set(regionsOf(r))) region.set(x, (region.get(x) ?? 0) + 1);
    if (passes(r, f, myFn, hasIcp, "fits") && r.fits) fits++;
    if (passes(r, f, myFn, hasIcp, "onMerlin") && r.onMerlin) onMerlin++;
  }
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    fn: sorted(fn),
    diff,
    same,
    levels: LEVELS.map((l) => [l, level.get(l) ?? 0] as [string, number]),
    regions: sorted(region).slice(0, 8),
    fits,
    onMerlin,
  };
}

/**
 * The line at the top: "142 fractionals serve companies like yours. 23 are on Merlin." Without an
 * Ideal Fractional Profile it counts everyone on file and asks for one.
 */
export function headline(records: FractionalRec[], hasIcp: boolean): string {
  const others = records.filter((r) => !r.you);
  const pool = hasIcp ? others.filter((r) => r.fits) : others;
  const on = pool.filter((r) => r.onMerlin).length;
  const n = pool.length;
  const lead = hasIcp ? `${n.toLocaleString("en-US")} ${n === 1 ? "fractional serves" : "fractionals serve"} companies like yours.` : `${n.toLocaleString("en-US")} ${n === 1 ? "fractional is" : "fractionals are"} on file.`;
  return `${lead} ${on.toLocaleString("en-US")} ${on === 1 ? "is" : "are"} on Merlin.`;
}

/** "C-level · Finance". */
export const levelLine = (r: Pick<FractionalRec, "level" | "fn">) => [r.level, r.fn && r.fn !== "Other" ? r.fn : null].filter(Boolean).join(" · ");

/** What a record leads with: their title when the member can see it, else "Fractional Sales leader". */
export const leadTitle = (r: Pick<FractionalRec, "title" | "fn">) => r.title || (r.fn && r.fn !== "Other" ? `Fractional ${r.fn} leader` : "Fractional leader");

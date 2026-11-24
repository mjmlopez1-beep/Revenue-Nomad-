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
import { nameForOthers } from "@/lib/memberName";
import { NAME_HIDDEN } from "@/lib/tableFields";
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
  // The new look's one Fractionals page opens at ?p=peers too (its record ?fr=, a seat's ?fs=, the welcome).
  if (q.get("p") !== "fractionals" && q.get("p") !== "partners" && q.get("p") !== "peers") return { diff: false, rec: null, seat: null, welcome: false, m: null };
  return { diff: q.get("ff") === "diff" || q.get("p") === "partners", rec: q.get("fr"), seat: q.get("fs"), welcome: q.get("welcome") === "1", m: q.get("m") };
}

/**
 * The same address for the new look's page (fractionals/FractionalsPage.tsx), read without using it
 * up: the shell can mount that page twice while it settles on its key (?p=partners becomes peers),
 * so the address counts for the first moments after the app loads, and no later.
 */
const START_AT = Date.now();
export function startPlaceNow(nowMs = Date.now()): ReturnType<typeof startPlace> {
  if (nowMs - START_AT > 15_000) return { diff: false, rec: null, seat: null, welcome: false, m: null };
  const was = startUsed;
  startUsed = false;
  const out = startPlace();
  startUsed = true;
  void was;
  return out;
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

/**
 * A member whose card the new look's Fractionals page should open (a Messages thread's Profile): set
 * before opening the page. Read without using it up, as the shell can mount the page twice while it
 * settles; the page clears it once it has the records, and it counts for 15 seconds at most.
 */
let wantMember: { id: string; at: number } | null = null;
export const openFractionalFor = (memberId: string, nowMs = Date.now()) => {
  wantMember = { id: memberId, at: nowMs };
};
export const peekWantMember = (nowMs = Date.now()): string | null => (wantMember && nowMs - wantMember.at < 15_000 ? wantMember.id : null);
export const doneWantMember = () => {
  wantMember = null;
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

/**
 * The chip on a record that serves companies in the member's Crystal Ball: "Serves 2 companies in
 * your Crystal Ball" (a current seat at one of them), else "Served 1 company in …". Null at none.
 */
export function ballChip(r: Pick<FractionalRec, "ball">): string | null {
  const b = r.ball;
  if (!b || b.n < 1) return null;
  return `${b.now ? "Serves" : "Served"} ${b.n} ${b.n === 1 ? "company" : "companies"} in your Crystal Ball`;
}

/** "C-level · Finance". */
export const levelLine = (r: Pick<FractionalRec, "level" | "fn">) => [r.level, r.fn && r.fn !== "Other" ? r.fn : null].filter(Boolean).join(" · ");

/** What a record leads with: their title when the member can see it, else "Fractional Sales leader". */
export const leadTitle = (r: Pick<FractionalRec, "title" | "fn">) => r.title || (r.fn && r.fn !== "Other" ? `Fractional ${r.fn} leader` : "Fractional leader");

/* =====================================================================================
 * The Fractionals page in the new look (fractionals/FractionalsPage.tsx, Fractionals.dc.html):
 * one page for the directory and Peers. Views over every record: All, Serve the same clients as
 * you, You know, Passed you a lead. Chips narrow a view; Ask Merlin sets them from plain words.
 * Every record arrives locked as the member may see it: these only narrow, count and word it.
 * ===================================================================================== */

/** The member's own card: the longest one line about them, and the longest "based in" (lib/table.ts CARD_LINE_MAX, CARD_CITY_MAX). */
export const CARD_LINE_MAX = 120;
export const CARD_CITY_MAX = 60;

export type FxView = "all" | "same" | "know" | "passed";
export const FX_VIEWS: { key: FxView; label: string }[] = [
  { key: "all", label: "All" },
  { key: "same", label: "Serve the same clients as you" },
  { key: "know", label: "You know" },
  { key: "passed", label: "Passed you a lead" },
];

export type FxChip = "on" | "off" | "diff" | "same" | "clevel" | "open" | "ev" | "unlocked" | "us";
export const FX_CHIPS: { key: FxChip; label: string }[] = [
  { key: "on", label: "On Merlin" },
  { key: "off", label: "Not on Merlin yet" },
  { key: "diff", label: "Other functions" },
  { key: "same", label: "Your function" },
  { key: "clevel", label: "C-level" },
  { key: "open", label: "Open to leads" },
  { key: "ev", label: "Shows evidence" },
  { key: "unlocked", label: "Unlocked" },
  { key: "us", label: "US" },
];
/** Chips that can't both be on: turning one on turns the other off. */
const EXCLUDES: Partial<Record<FxChip, FxChip>> = { on: "off", off: "on", diff: "same", same: "diff" };

export interface FxFilters {
  chips: FxChip[];
  /** One function ("" any), one level ("" any), one region as shortCountry spells it ("" any), one industry ("" any). */
  fn: string;
  level: string;
  region: string;
  industry: string;
}
export const fxNone = (): FxFilters => ({ chips: [], fn: "", level: "", region: "", industry: "" });
export const fxAny = (f: FxFilters) => f.chips.length > 0 || !!(f.fn || f.level || f.region || f.industry);

/** Flip one chip, keeping its opposite off. */
export function fxFlip(f: FxFilters, k: FxChip): FxFilters {
  const on = f.chips.includes(k);
  const ex = EXCLUDES[k];
  const chips = on ? f.chips.filter((x) => x !== k) : [...f.chips.filter((x) => x !== ex), k];
  return { ...f, chips };
}

/** What only the member holds, keyed by keyOf: who they know (from their own sources) and who passed them a lead. */
export interface FxCtx {
  myFn: string | null;
  hasIcp: boolean;
  know: Map<string, { from: string; why: string }>;
  passed: Set<string>;
}
/** A record's key against Peers: a member's public id, else the record's own id. */
export const keyOf = (r: Pick<FractionalRec, "memberId" | "id">) => r.memberId ?? r.id;

export function fxInView(r: FractionalRec, view: FxView, x: FxCtx): boolean {
  if (r.you) return false;
  if (view === "same") return x.hasIcp && r.fits;
  if (view === "know") return x.know.has(keyOf(r));
  if (view === "passed") return x.passed.has(keyOf(r));
  return true;
}

const industriesOf = (r: FractionalRec) => r.clients?.industries ?? [];

function chipOk(r: FractionalRec, k: FxChip, x: FxCtx): boolean {
  switch (k) {
    case "on":
      return r.onMerlin;
    case "off":
      return !r.onMerlin;
    case "diff":
      return fnMatches(r, "diff", x.myFn);
    case "same":
      return fnMatches(r, "same", x.myFn);
    case "clevel":
      return r.level === "C-level";
    case "open":
      return r.leads === "open";
    case "ev":
      return !!r.cases?.length;
    case "unlocked":
      return !!r.unlocked;
    case "us":
      return regionsOf(r).includes("US");
  }
}

/** The filters, one chip left out (`skip`) for its own count. */
export function fxPasses(r: FractionalRec, f: FxFilters, x: FxCtx, skip?: FxChip): boolean {
  for (const k of f.chips) if (k !== skip && !chipOk(r, k, x)) return false;
  if (f.fn && !fnMatches(r, f.fn, x.myFn)) return false;
  if (f.level && r.level !== f.level) return false;
  if (f.region && !regionsOf(r).includes(f.region)) return false;
  if (f.industry && !industriesOf(r).some((i) => i.toLowerCase() === f.industry.toLowerCase())) return false;
  return true;
}

/** Best for you first (frOrder); in You know, members you can write to first. */
export function fxRows(records: FractionalRec[], view: FxView, f: FxFilters, x: FxCtx): FractionalRec[] {
  return records
    .filter((r) => fxInView(r, view, x) && fxPasses(r, f, x))
    .sort(frOrder);
}

/** Each view's count, the filters off (the tabs). */
export function fxViewCounts(records: FractionalRec[], x: FxCtx): Record<FxView, number> {
  const out: Record<FxView, number> = { all: 0, same: 0, know: 0, passed: 0 };
  for (const r of records) for (const v of FX_VIEWS) if (fxInView(r, v.key, x)) out[v.key]++;
  return out;
}

/** Beside each chip: how many in this view it would show, with the other filters as they are. */
export function fxChipCounts(records: FractionalRec[], view: FxView, f: FxFilters, x: FxCtx): Record<FxChip, number> {
  const out = Object.fromEntries(FX_CHIPS.map((c) => [c.key, 0])) as Record<FxChip, number>;
  for (const r of records) {
    if (!fxInView(r, view, x)) continue;
    for (const c of FX_CHIPS) {
      const ex = EXCLUDES[c.key];
      const g: FxFilters = { ...f, chips: f.chips.filter((k) => k !== ex) };
      if (fxPasses(r, g, x, c.key) && chipOk(r, c.key, x)) out[c.key]++;
    }
  }
  return out;
}

/** The choices for the Function, Level, Region and Industry pickers, by count in this view. */
export function fxPickers(records: FractionalRec[], view: FxView, x: FxCtx) {
  const fn = new Map<string, number>();
  const level = new Map<string, number>();
  const region = new Map<string, number>();
  const industry = new Map<string, number>();
  const add = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const r of records) {
    if (!fxInView(r, view, x)) continue;
    for (const v of fnsOf(r)) add(fn, v);
    if (r.level) add(level, r.level);
    for (const v of new Set(regionsOf(r))) add(region, v);
    for (const v of new Set(industriesOf(r))) add(industry, v);
  }
  const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return { fn: sorted(fn), level: LEVELS.filter((l) => level.has(l)).map((l) => [l, level.get(l)!] as [string, number]), region: sorted(region).slice(0, 12), industry: sorted(industry).slice(0, 20) };
}

/** The fill row under the headers: how much of each column the rows in view hold (a hidden value is not filled). */
export function fxFill(rows: FractionalRec[]) {
  const n = rows.length;
  const pct = (fn: (r: FractionalRec) => boolean) => (n ? Math.round((100 * rows.filter(fn).length) / n) : 0);
  return {
    named: pct((r) => !!r.name),
    common: pct((r) => !!r.common),
    industries: pct((r) => industriesOf(r).length > 0),
    ev: pct((r) => !!r.cases?.length),
    open: pct((r) => r.leads === "open"),
  };
}

const COMMON_WHY = { seat: "You both held a seat there", pipeline: "In your pipeline", ball: "In your Crystal Ball" } as const;

/** "Halcyon Freight" / "You both held a seat there", or "1 locked company" when the viewer can't see its name. */
export function commonWords(r: Pick<FractionalRec, "common">): { a: string; b: string } | null {
  const c = r.common;
  if (!c) return null;
  const locked = c.locked ? `${c.locked} locked ${c.locked === 1 ? "company" : "companies"}` : "";
  return { a: [c.names.join(", "), locked].filter(Boolean).join(", "), b: COMMON_WHY[c.why] };
}

/** "Software, EdTech" / "51–200 people". */
export function industryWords(r: Pick<FractionalRec, "clients">): { a: string; b: string } | null {
  const c = r.clients;
  if (!c || !(c.industries.length || c.employees.length)) return null;
  return { a: c.industries.slice(0, 2).join(", ") || "Any industry", b: c.employees.length ? `${c.employees.slice(0, 2).join(", ")} people` : "" };
}

/** The Open to leads cell: Open, Not now, Not yet (not on Merlin), or nothing when unsaid. */
export function leadsWord(r: Pick<FractionalRec, "leads" | "onMerlin" | "you">): "Open" | "Not now" | "Not yet" | "" {
  if (!r.onMerlin) return "Not yet";
  if (r.leads === "open") return "Open";
  if (r.leads === "off") return "Not now";
  return "";
}

/**
 * The first visit's "Three to start with": members on Merlin the member can write to, who serve their
 * kind of client, Peers' own order first (complementary functions, their Crystal Ball), then the
 * directory's best fit.
 */
export function startThree(records: FractionalRec[], peersOrder: string[], x: FxCtx): FractionalRec[] {
  const ok = (r: FractionalRec) => !r.you && r.onMerlin && !!r.memberId && (!x.hasIcp || r.fits);
  const by = new Map(records.filter(ok).map((r) => [keyOf(r), r] as const));
  const out: FractionalRec[] = [];
  for (const k of peersOrder) {
    const r = by.get(k);
    if (r && !out.includes(r)) out.push(r);
    if (out.length === 3) return out;
  }
  for (const r of [...by.values()].sort(frOrder)) {
    if (!out.includes(r)) out.push(r);
    if (out.length === 3) break;
  }
  return out;
}

/** What other members see as the member's name on their card: in full, short until they choose, or hidden. */
export function cardName(me: { name: string; fractionals?: boolean | null; nameHidden?: boolean }): { name: string; state: string } {
  // One rule with the server (lib/memberName.ts nameForOthers): full only when they show in the directory.
  const name = nameForOthers(me.name, me);
  if (me.nameHidden) return { name: NAME_HIDDEN, state: "Out of the directory, and your seats show no name." };
  if (me.fractionals === true) return { name, state: "This is what a member sees, free." };
  if (me.fractionals === false) return { name: `${name}, not listed`, state: "No member sees this card. People you already talk to can still write." };
  return { name, state: "Until you choose, members see your first name and last initial." };
}

/* ---------- Ask Merlin, by rules (BUILD_PLAN F4): words to a view and chips, the rest said back ---------- */

const FN_WORDS: [RegExp, string][] = [
  [/\b(cfo|finance|financial|controller)\b/, "Finance"],
  [/\b(cmo|marketing|marketer|demand gen|growth)\b/, "Marketing"],
  [/\b(cro|sales|vp sales|seller|selling)\b/, "Sales"],
  [/\b(revops|rev ops|revenue operations|sales ops)\b/, "RevOps"],
  [/\b(customer success|cs leader|cco|retention)\b/, "Customer Success"],
  [/\b(cto|technology|engineering|tech)\b/, "Technology"],
  [/\b(coo|operations)\b/, "Operations"],
  [/\b(cpo|product)\b/, "Product"],
  [/\b(chro|people|hr|talent)\b/, "People"],
];
const SKIP = new Set("a an the who that and or with for in of to on at is are be my me i we our you your their them they fractional fractionals leader leaders lead person people someone one any some like same kind serves serve serving works work working clients client companies company find show".split(" "));

export interface FxAsk {
  view: FxView | null;
  f: FxFilters;
  /** What Merlin set, in words, for the line under the box. */
  said: string[];
  /** Words it didn't know, said back (never guessed). */
  unknown: string[];
}

/** "A fractional CFO who serves fintech and takes leads" -> Finance, industry Fintech, Open to leads. `industries` from the records in hand. */
export function askFx(text: string, industries: string[], fns: string[]): FxAsk {
  let t = ` ${text.toLowerCase().replace(/[^a-z0-9&\s-]/g, " ").replace(/\s+/g, " ")} `;
  const f = fxNone();
  const said: string[] = [];
  let view: FxView | null = null;
  const take = (re: RegExp) => {
    const hit = re.test(t);
    if (hit) t = t.replace(new RegExp(re.source, "g"), " ");
    return hit;
  };
  if (take(/\b(serves? my clients|my clients|same clients|clients like mine|like mine|my kind of client|my ideal client)\b/)) (view = "same"), said.push("Serve the same clients as you");
  if (take(/\b(i know|you know|people i know|already know|know)\b/)) (view = "know"), said.push("You know");
  if (take(/\b(passed me|passed you|passed a lead|sent me a lead)\b/)) (view = "passed"), said.push("Passed you a lead");
  if (take(/\b(takes? leads|open to leads|taking leads|wants? leads|leads)\b/)) f.chips.push("open"), said.push("Open to leads");
  if (take(/\b(not on merlin|invite|not a member)\b/)) f.chips.push("off"), said.push("Not on Merlin yet");
  else if (take(/\b(on merlin|members?)\b/)) f.chips.push("on"), said.push("On Merlin");
  if (take(/\b(evidence|case studies|case study|cases|proof)\b/)) f.chips.push("ev"), said.push("Shows evidence");
  if (take(/\b(c-level|c level|chief|executive)\b/)) f.chips.push("clevel"), said.push("C-level");
  if (take(/\b(other functions?|different functions?|beside me|next to me)\b/)) f.chips.push("diff"), said.push("Other functions");
  else if (take(/\b(my function|same function|like me)\b/)) f.chips.push("same"), said.push("Your function");
  if (take(/\b(us|usa|united states|american)\b/)) f.chips.push("us"), said.push("US");
  if (take(/\b(unlocked|i opened)\b/)) f.chips.push("unlocked"), said.push("Unlocked");
  for (const [re, fn] of FN_WORDS)
    if (!f.fn && take(re) && (fns.includes(fn) || !fns.length)) {
      f.fn = fn;
      said.push(fn);
    }
  // An industry the records hold, by its own words ("fintech", "health care"): the longest first.
  for (const ind of [...industries].sort((a, b) => b.length - a.length)) {
    const w = ind.toLowerCase().replace(/[^a-z0-9&\s-]/g, " ").trim();
    if (!w || f.industry) continue;
    const re = new RegExp(`\\b${w.replace(/[-\s]+/g, "[-\\s]+")}\\b`);
    if (take(re)) {
      f.industry = ind;
      said.push(ind);
    }
  }
  const unknown = [...new Set(t.split(" ").filter((w) => w && w.length > 1 && !SKIP.has(w) && !/^\d+$/.test(w)))];
  return { view, f, said, unknown };
}

/** A fellow fractional Peers knows of (a suggestion, someone you know, a lead or a team between you), as Peers names them. */
export interface PeerLike {
  memberId: string;
  name: string;
  first?: string;
  initials?: string;
  title?: string;
  fn: string | null;
  level?: string | null;
  /** Peers says they serve the viewer's kind of client. */
  fits?: boolean;
  conversationId?: string;
}

/**
 * The directory lists fractionals by their seats; a member on Merlin with no seat on file has no
 * record there, though Peers suggests them, they are someone you know, or a lead or team is between
 * you. Each such member joins the list as a record with no seats, named as Peers names them (its own
 * privacy rules), so nobody Peers showed goes missing from the one page.
 */
export function withPeers(records: FractionalRec[], peers: PeerLike[], unlisted: string[] = []): FractionalRec[] {
  // Out of the directory (Peers names them only because the two already work together): never a row here.
  const have = new Set([...records.map((r) => r.memberId).filter(Boolean), ...unlisted]);
  const out = [...records];
  for (const p of peers) {
    if (!p.memberId || have.has(p.memberId)) continue;
    have.add(p.memberId);
    const ini = p.initials ?? p.name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
    out.push({
      id: `p_${p.memberId}`,
      name: p.name,
      first: p.first ?? p.name.split(/\s+/)[0],
      initials: ini,
      onMerlin: true,
      memberId: p.memberId,
      ...(p.title ? { title: p.title } : {}),
      fn: p.fn,
      level: p.level ?? null,
      fns: p.fn ? [p.fn] : [],
      seats: [],
      now: 0,
      past: 0,
      clients: null,
      fits: !!p.fits,
      ...(p.conversationId ? { conversationId: p.conversationId } : {}),
    });
  }
  return out;
}

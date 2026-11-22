/**
 * Where the table opens, and the list it opens on, as pure functions: the app (TradingPost.tsx)
 * reads its place from the address with these, and the server (lib/firstPage.ts, GET
 * /api/table?first=1) works out the same list's first rows and counts with them, so a phone can
 * draw the first cards before the whole table has arrived. No browser and no Node imports.
 *
 * `off` is the onboarding presets the member took off in this browser (presetsOff in
 * TradingPost.tsx); the server is told them with the request.
 */
import type { Me, SavedViewRec } from "@/lib/tableTypes";
import { SIG_DAY_RE, radarRangeOf } from "@/lib/radar/types";
import { firstViewPlace } from "../onboard/place";
import {
  EMPTY_FILTERS, RECORD_TYPES, SORTS, TYPE_PARAM, activeCount, applyFilters, decodeFilters, encodeFilters, hasRoleDates, hiredOn, icpApplies, icpEmpty, icpMatch, mySeats, namedFn,
  newThisWeek, placeFilters, rowsFor, seatsMissing, shown, sortFor, sortRows, splitByFn, tabOf,
  type CoInfo, type Facets, type Filters, type HireCtx, type RecordType, type Row, type SortKey, type Tab, type ToggleKey,
} from "./model";
import { holderSeen, personSeen, stepOneKind, type StepOne } from "./getStarted";

/**
 * Filters an onboarding answer turns on ("No Sales seat yet" for a member after adjacent seats,
 * "Seat holder on file" for one after an intro). They narrow the All view only: the other views
 * and their counts ignore them, so Hiring now never reads 0 because of an answer given once.
 */
export const PRESET_KEYS: ToggleKey[] = ["notMine", "fractionalNamed"];

/** The pages a place can name (?p=). Today and the table are the two without one. */
export const PLACE_PAGES = ["seats", "credits", "rates", "metrics", "messages", "integrations", "notifications", "partners", "billing", "radar", "network", "fractionals", "pipeline", "proposals", "peers"] as const;
export type PlacePage = (typeof PLACE_PAGES)[number];

/** The address keys that name a place in the app. With none of them, / opens Today. */
export const PLACE_KEYS = ["v", "t", "s", "f", "q", "c", "p", "af", "sig", "upgrade", "plans"];

/**
 * Where a member lands with nothing in the address bar: their first view (the saved view
 * onboarding ended on) while it is saved, else what their onboarding answer (Me.goal) set. "No
 * fractional <fn> yet" from either is the onboarding preset (PRESET_KEYS): it narrows All only,
 * and once taken off it stays off.
 */
export function placeDefaults(me: Me, off: Set<string>) {
  const first = firstViewPlace(me);
  const home = first ? placeFilters(first) : null;
  if (home?.t && home.v) {
    const s = SORTS.find((x) => x.key === new URLSearchParams(first!).get("s"))?.key;
    return {
      t: home.t,
      v: home.v,
      s: (s ?? (hiredOn(home.f) ? "hired" : !icpEmpty(me.icp) || namedFn(me.function) ? "best" : "fit")) as SortKey,
      f: { ...home.f, notMine: home.f.notMine && !off.has("notMine") } as Filters,
    };
  }
  return {
    t: (me.goal === "intro" || me.goal === "roles" ? "engagements" : "companies") as RecordType,
    // The goal key "friendly" is stored on profiles, so it stays. It opens on Repeat hirers now.
    v: (me.goal === "friendly" ? "repeat" : me.goal === "roles" ? "hiring" : "all") as Tab,
    // With an ideal client or a function on file, the best fit for them comes first (seats in their own function lead). Open roles read best newest first.
    s: (!icpEmpty(me.icp) || (namedFn(me.function) && me.goal !== "roles") ? "best" : me.goal === "roles" ? "newest" : "fit") as SortKey,
    // The table opens on their ideal client (the Ideal Fractional Profile pill).
    f: {
      ...EMPTY_FILTERS,
      notMine: me.goal === "adjacent" && !!me.function && !off.has("notMine"),
      fractionalNamed: me.goal === "intro" && !off.has("fractionalNamed"),
      icp: !icpEmpty(me.icp),
    } as Filters,
  };
}
/**
 * The sort a view opens on until the member picks one: Hiring now reads newest first (their
 * function first), Recently hired the most recent hire first.
 */
export const placeSortDefault = (me: Me, v: Tab, f: Filters | undefined, off: Set<string>): SortKey =>
  v === "hiring" ? "newest" : f && hiredOn(f) ? "hired" : placeDefaults(me, off).s;

export type Place = ReturnType<typeof parsePlace>;
/** A place from an address query: `search` is the address's own, or `from` a saved view's (never Today). */
export function parsePlace(me: Me, search: string, off: Set<string>, from?: string) {
  const d = placeDefaults(me, off);
  const q = new URLSearchParams(from ?? search);
  const t = (Object.keys(TYPE_PARAM) as RecordType[]).find((k) => TYPE_PARAM[k] === q.get("t")) ?? d.t;
  // An old link's v=friendly opens Repeat hirers, the tab that replaced it.
  const v = tabOf(q.get("v")) ?? d.v;
  // Null: the member hasn't picked a sort, so the view's own default applies.
  const s = SORTS.find((x) => x.key === q.get("s"))?.key ?? null;
  const f = q.has("f") ? decodeFilters(q.get("f") === "-" ? "" : q.get("f")!) : d.f;
  // An old "Use it in Claude" link (p=claude) opens Integrations at its Claude section.
  // A day of the radar (?sig=2026-11-19, the email's and Slack's links, lib/radar radarPath) opens that day's companies,
  // and so does an older email's "See who" (?upgrade=radar).
  const sig = SIG_DAY_RE.test(q.get("sig") ?? "") ? q.get("sig") : null;
  const p0: PlacePage | null = sig ? "radar" : q.get("p") === "claude" ? "integrations" : !q.get("p") && q.get("upgrade") === "radar" ? "radar" : PLACE_PAGES.find((x) => x === q.get("p")) ?? null;
  // The Fractionals directory (and Referral partners before it) lives in Peers now: their old addresses open Peers' Every fractional.
  const p: PlacePage | null = p0 === "fractionals" || p0 === "partners" ? "peers" : p0;
  const pt = p === "peers" && (p0 !== "peers" || q.get("pt") === "all");
  // The radar's range the member picked (?p=radar&range=7d); a day (?sig=) wins.
  const range = p === "radar" && !sig ? radarRangeOf(q.get("range")) : null;
  // Nothing in the address that names a place (?c=, ?p=, ?v= and the rest): Today, the home. "?p=table" is the table at its defaults.
  const home = !from && !PLACE_KEYS.some((k) => q.has(k));
  return { t, v, s, f, q: (q.get("q") ?? "").slice(0, 200), c: q.get("c"), p, all: q.get("af") === "1", sig, ...(range ? { range } : {}), ...(pt ? { pt: true } : {}), home };
}
/** The address names no place: / opens Today. */
export const isHome = (search: string) => {
  const q = new URLSearchParams(search);
  return !PLACE_KEYS.some((k) => q.has(k));
};

/** The facet counts of All and of the other views when an onboarding preset narrows All only (TradingPost's `facets`). */
export function presetFacets(facets0: Facets, other: Facets | null, tab: Tab): Facets {
  if (!other) return facets0;
  const o = other.tabs;
  return tab === "all"
    ? {
        ...facets0,
        tabs: { ...o, all: facets0.tabs.all },
        hiringMine: other.hiringMine,
        // Open now counts what picking it lists (the preset steps aside for it), the Hiring now count.
        lists: { ...facets0.lists, roleState: { ...facets0.lists.roleState, "Open now": other.lists.roleState["Open now"] } },
      }
    : { ...facets0, tabs: { ...facets0.tabs, all: o.all } };
}

/** What decides the list and its counts. Two the same: the same rows in the same order, the same numbers. */
export const listKeyOf = (x: { t: RecordType; tab: Tab; sort: SortKey; q: string; eff: Filters; filters: Filters; presetOn: ToggleKey[]; all: boolean; fitOnly: boolean; wide: boolean }) =>
  [x.t, x.tab, x.sort, x.q, encodeFilters(x.eff), encodeFilters(x.filters), x.presetOn.join(","), x.all ? 1 : 0, x.fitOnly ? 1 : 0, x.wide ? 1 : 0].join("|");

/** The first page of the table: how many rows it carries the companies of. */
export const FIRST_ROWS = 50;

/**
 * What the table shows before the whole table has arrived (GET ?first=1): the counts its first
 * screen draws, worked out on the whole table exactly as TradingPost works them out, for the list
 * `key` names. The page uses them while it has only the first rows' companies.
 */
export interface FirstList {
  key: string;
  /** How many rows the whole list has. */
  n: number;
  facets: Facets;
  typeCounts: Record<RecordType, number>;
  totals: Record<RecordType, number>;
  hiringLift: number;
  icpSplit: { match: number; maybe: number } | null;
  outside: number;
  steps: { kind: StepOne; seen: boolean; seats: { n: number; missing: number } };
  has: { industry: boolean; roles: boolean };
  /**
   * Hiring now's line while it leads with the member's function: its roles in other functions,
   * its own function's roles with the profile lifted, all of its own function's, and how many are
   * new this week (in the list, and with every function listed). Null on any other view.
   */
  hire: { others: number; lift: number; mine: number; fresh: number; freshAll: number } | null;
  /** With the request's `since` (the previous visit): companies the member follows that changed since then (TradingPost's "since your last visit"). */
  follows?: number;
}

/** Rows with a role new this week (in `fn`, when given): the "4 new this week" on Hiring now. */
export const weekN = (rows: Row[], fn: string | null) =>
  rows.filter((r) => (r.e ? [r.e] : r.i.engs).some((e) => newThisWeek(e) && (!fn || shown(e.cells.function) === fn))).length;

/** What listAt and placeRows share: the filters in play and the rows they keep. */
function listCore(infos: CoInfo[], me: Me, place: Place, off: Set<string>) {
  const recordType = place.t;
  const filters = place.f;
  const q = place.q;
  const searching = !!q.trim();
  const tab: Tab = searching ? "all" : place.v;
  const allFns = place.all;
  const d = placeDefaults(me, off).f;
  const presetOn = PRESET_KEYS.filter((k) => d[k] && place.f[k]).filter((k) => filters[k]);
  const unpreset = presetOn.length ? ({ ...filters, ...Object.fromEntries(presetOn.map((k) => [k, false])) } as Filters) : filters;
  const presetHere = tab === "all" && !filters.roleState.includes("Open now");
  const eff = presetHere ? filters : unpreset;
  const hireFn = tab === "hiring" ? namedFn(me.function) : null;
  const allRows = rowsFor(recordType, infos);
  const { rows: filtered, facets: facets0 } = applyFilters(allRows, eff, tab, q, me);
  const fnSplit = hireFn ? splitByFn(filtered, hireFn) : null;
  const hireIcp = icpApplies(eff, tab, me);
  let liftRows: Row[] | null = null;
  if (hireFn && fnSplit && fnSplit.mine.length === 0 && hireIcp && !allFns && !q.trim()) {
    const mine = splitByFn(applyFilters(allRows, { ...eff, icp: false }, tab, q, me, true).rows, hireFn).mine;
    liftRows = mine.length ? mine : null;
  }
  const lifted = !!liftRows;
  const hireList: Row[] | null = hireFn && fnSplit && !allFns && !q.trim() ? (fnSplit.mine.length ? fnSplit.mine : lifted ? liftRows! : []) : null;
  return { recordType, filters, q, searching, tab, allFns, presetOn, unpreset, eff, hireFn, allRows, filtered, facets0, fnSplit, liftRows, lifted, hireList };
}

/**
 * The rows a place lists, unsorted: what listAt's first.n counts, without its counts and sort.
 * The sidebar's Hiring now count and each saved view's matches (TradingPost) are these.
 */
export function placeRows(infos: CoInfo[], me: Me, place: Place, off: Set<string>): Row[] {
  const c = listCore(infos, me, place, off);
  return c.hireList ?? c.filtered;
}

/**
 * The list a place opens on, on the member's whole table, as TradingPost works it out when it
 * mounts there (no search widened, "Only my profile" off, no record frozen in place): its rows in
 * order and the counts the first screen shows.
 */
export function listAt(infos: CoInfo[], me: Me, place: Place, off: Set<string>): { rows: Row[]; first: FirstList } {
  const { recordType, filters, q, searching, tab, allFns, presetOn, unpreset, eff, hireFn, allRows, filtered, facets0, fnSplit, liftRows, lifted, hireList } = listCore(infos, me, place, off);
  const sort = sortFor(recordType, place.s ?? placeSortDefault(me, tab, filters, off));
  const hireCtx: HireCtx | null = hiredOn(eff) ? { fns: eff.hiredFn, within: eff.hiredWithin } : null;
  const other = presetOn.length ? applyFilters(allRows, tab === "all" ? unpreset : filters, tab, q, me).facets : null;
  const facets = presetFacets(facets0, other, tab);
  const typeCounts = {} as Record<RecordType, number>;
  const f2 = lifted ? { ...eff, icp: false } : eff;
  for (const t of RECORD_TYPES) {
    if (t.key === recordType) typeCounts[t.key] = (hireList ?? filtered).length;
    else {
      const rows = applyFilters(rowsFor(t.key, infos), f2, tab, q, me, true).rows;
      typeCounts[t.key] = hireList && hireFn ? (hireList.length || lifted ? splitByFn(rows, hireFn).mine.length : 0) : rows.length;
    }
  }
  const narrowed = q.trim() && (icpApplies(eff, tab, me) || activeCount(eff) > 0);
  const outside = narrowed ? Math.max(0, applyFilters(allRows, EMPTY_FILTERS, tab, q, me, true).rows.length - filtered.length) : 0;
  const rows = sortRows(hireList ?? filtered, sort, tab === "needs", q, { me, fnFirst: hireFn, hire: hireCtx });
  const myFn = namedFn(me.function);
  const hiringLift =
    tab === "hiring" || !myFn || allFns || searching || facets.hiringMine > 0 || !icpApplies(unpreset, "hiring", me)
      ? 0
      : splitByFn(applyFilters(allRows, { ...unpreset, icp: false }, "hiring", q, me, true).rows, myFn).mine.length;
  let icpSplit: FirstList["icpSplit"] = null;
  if (icpApplies(eff, tab, me)) {
    const listed = hireList ?? filtered;
    let match = 0;
    for (const r of listed) if (icpMatch(me.icp, r.i.c) === "match") match++;
    icpSplit = { match, maybe: listed.length - match };
  }
  const seats = mySeats(infos, me);
  const kind = stepOneKind(infos);
  return {
    rows,
    first: {
      key: listKeyOf({ t: recordType, tab, sort, q, eff, filters, presetOn, all: allFns, fitOnly: false, wide: false }),
      n: rows.length,
      facets,
      typeCounts,
      totals: { companies: infos.length, engagements: infos.reduce((n, i) => n + i.engs.length, 0), people: infos.reduce((n, i) => n + i.people.length, 0) },
      hiringLift,
      icpSplit,
      outside,
      steps: { kind, seen: holderSeen(infos) || (kind === "person" && personSeen(infos)), seats: { n: seats.length, missing: seatsMissing(seats) } },
      has: { industry: infos.some((i) => i.c.cells.industry?.s === "value"), roles: infos.some(hasRoleDates) },
      hire:
        hireFn && fnSplit
          ? { others: fnSplit.others.length, lift: liftRows?.length ?? 0, mine: fnSplit.mine.length, fresh: hireList ? weekN(hireList, hireFn) : 0, freshAll: weekN(rows, null) }
          : null,
    },
  };
}

/**
 * Where a saved view opens: its own place, or (a search saved in Claude, which has none) the open
 * roles it looks for, in every function it names. TradingPost opens it there, and counts its
 * matches (placeRows) the same way.
 */
export function savedViewPlace(me: Me, v: SavedViewRec, off: Set<string>): Place {
  if (v.place) return parsePlace(me, "", off, v.place);
  const c = v.criteria;
  return {
    t: "engagements",
    v: "hiring",
    s: null,
    q: "",
    c: null,
    p: null,
    all: true,
    sig: null,
    home: false,
    f: {
      ...EMPTY_FILTERS,
      fn: c.functions ?? (c.function ? [c.function] : []),
      industry: c.industry ?? [],
      employees: c.employees ?? [],
      revenue: c.revenue ?? [],
      country: c.country ?? [],
      hq: c.hq ? [c.hq] : [],
      hiredFn: c.hiredFn ?? [],
      hiredWithin: c.hiredWithin ?? 0,
    } as Filters,
  };
}

/**
 * How many of a place's companies are new since the last visit (`since`, ISO): a fact added there
 * since (its updatedAt), or a role that opened since. Each company once.
 */
export function freshCount(rows: Row[], since: string | null): number {
  if (!since) return 0;
  const at = Date.parse(since);
  const seen = new Set<string>();
  let n = 0;
  for (const r of rows) {
    const i = r.i;
    if (seen.has(i.c.id)) continue;
    seen.add(i.c.id);
    const roleNew = i.engs.some((e) => {
      const t = Date.parse(e.openedAt ?? (e.opened ? `${e.opened}T00:00:00Z` : ""));
      return Number.isFinite(t) && t > at && !e.unseen;
    });
    if (roleNew || (!!i.c.updatedAt && i.c.updatedAt > since)) n++;
  }
  return n;
}

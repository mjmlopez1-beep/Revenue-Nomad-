/**
 * Onboarding's first view, the pure parts, so scripts/test-onboard.mts checks them without a
 * browser:
 *   - "Which fractional usually gets hired before you?": the functions it offers, in a suggested
 *     order (our data where it says something, else the usual ones for the member's function);
 *   - the first view those answers build: companies in the member's Ideal Fractional Profile that
 *     hired a fractional in those functions in the last 12 months and have no fractional in the
 *     member's own function yet, widened until it shows enough, and the saved view that reopens it;
 *   - the goal a new member gets, and which copy of their answers to resume from.
 *
 * The first view is the "Recently hired" filter (Filters.hiredFn and .hiredWithin, lib/hired.ts)
 * with the profile pill and "No fractional <function> yet", on the All view of companies, sorted by
 * the most recent hire: the same filter and sort the table opens on, so it lists the same rows.
 */
import { FUNCTIONS } from "@/lib/tableFields";
import { BEFORE_MAX, type EngagementRec, type Icp, type Me, type SavedViewCriteria } from "@/lib/tableTypes";
import { fnLeader, hireMonth, windowPhrase } from "@/lib/hired";
import {
  EMPTY_FILTERS, absolutePlace, applyFilters, criteriaOf, hireOfRow, icpEmpty, isFirm, isHire, namedFn, rowsFor, shown, sortRows, viewName, withIcpSpelled,
  type CoInfo, type Filters, type Row,
} from "@/app/post/model";

export { BEFORE_MAX };

/* ---------- who usually gets hired before you ---------- */

/**
 * The fractionals usually hired before each function, for when our data says too little: the
 * owner's examples (Sales, Marketing, Finance, RevOps) and the same reasoning for the rest.
 */
export const BEFORE_DEFAULTS: Record<string, string[]> = {
  Sales: ["Marketing", "RevOps", "Finance"],
  Marketing: ["Sales", "RevOps", "Product Marketing"],
  Finance: ["Sales", "Operations", "People"],
  RevOps: ["Sales", "Marketing", "Customer Success"],
  "Customer Success": ["Sales", "RevOps", "Marketing"],
  Partnerships: ["Sales", "Marketing", "Growth"],
  Growth: ["Marketing", "Sales", "Product Marketing"],
  "Product Marketing": ["Marketing", "Product", "Sales"],
  Enablement: ["Sales", "RevOps", "Customer Success"],
  "AI GTM": ["Marketing", "Sales", "RevOps"],
  Technology: ["Product", "Finance", "Operations"],
  Operations: ["Finance", "People", "Sales"],
  People: ["Finance", "Operations", "Sales"],
  Product: ["Technology", "Marketing", "Product Marketing"],
  Legal: ["Finance", "Operations", "People"],
};
/** A catch-all function (Executive, Other) or none: the fractionals hired most. */
const FALLBACK = ["Sales", "Marketing", "Finance"];

/**
 * Companies a function must have started before the member's at, on dated seats, before our data
 * puts it first. Fewer is chance: the usual order for the function leads instead.
 */
export const BEFORE_MIN_COMPANIES = 3;

/**
 * The functions "Which fractional usually gets hired before you?" offers: every one but the
 * member's own, Executive last. Not "Other": it means none of the above, which says nothing here.
 */
export function beforeOptions(fn: string | null): string[] {
  const all = FUNCTIONS.filter((f) => f !== fn && f !== "Other");
  return [...all.filter((f) => !!namedFn(f)), ...all.filter((f) => !namedFn(f))];
}

/**
 * The functions in the order the question offers them. First the ones our data says start before
 * the member's: at companies with hires in both (isHire, so full-time seats and open roles don't
 * count), the first hire in that function started in an earlier month than the first in theirs, at
 * BEFORE_MIN_COMPANIES or more companies. Then the usual ones for their function (BEFORE_DEFAULTS),
 * up to BEFORE_MAX in all (`suggested`). Then every other function, the ones found at the same
 * companies as theirs first. `fromData`: the suggested ones our data put there.
 */
export function beforeOrder(infos: CoInfo[], fn: string | null): { order: string[]; suggested: string[]; fromData: string[] } {
  const own = namedFn(fn);
  const options = beforeOptions(fn);
  /** At how many companies a function's first hire came before the member's function's first hire. */
  const first = new Map<string, number>();
  /** At how many companies a function was hired alongside the member's. */
  const both = new Map<string, number>();
  if (own)
    for (const i of infos) {
      if (isFirm(i.c)) continue;
      // The earliest month on file per function ("" for hires with no start on file).
      const earliest = new Map<string, string>();
      for (const e of i.engs) {
        if (!isHire(e)) continue;
        const f = shown(e.cells.function);
        if (!f) continue;
        const m = hireMonth(shown(e.cells.start)) ?? "";
        const cur = earliest.get(f);
        if (cur === undefined || (m && (!cur || m < cur))) earliest.set(f, m);
      }
      const mine = earliest.get(own);
      if (mine === undefined) continue;
      for (const [f, m] of earliest) {
        if (f === own) continue;
        both.set(f, (both.get(f) ?? 0) + 1);
        if (mine && m && m < mine) first.set(f, (first.get(f) ?? 0) + 1);
      }
    }
  const n = (m: Map<string, number>, f: string) => m.get(f) ?? 0;
  const byData = (a: string, b: string) => n(first, b) - n(first, a) || n(both, b) - n(both, a);
  // A catch-all is never suggested: "a fractional Other leader" says nothing. It stays on offer, last.
  const named = options.filter((f) => !!namedFn(f));
  const fromData = named.filter((f) => n(first, f) >= BEFORE_MIN_COMPANIES).sort(byData).slice(0, BEFORE_MAX);
  const usual = (fn && BEFORE_DEFAULTS[fn]) || FALLBACK;
  const suggested = [...new Set([...fromData, ...usual.filter((f) => named.includes(f))])].slice(0, BEFORE_MAX);
  const rest = named.filter((f) => !suggested.includes(f)).sort((a, b) => byData(a, b) || FUNCTIONS.indexOf(a) - FUNCTIONS.indexOf(b));
  const catchAll = options.filter((f) => !namedFn(f));
  return { order: [...suggested, ...rest, ...catchAll], suggested, fromData: fromData.filter((f) => suggested.includes(f)) };
}

/** A tap on a function: on or off, at most BEFORE_MAX on (a tap past that changes nothing). "Not sure" ([]) gives way to it. */
export function toggleBefore(before: string[] | null, f: string): string[] {
  const now = before ?? [];
  if (now.includes(f)) return now.filter((x) => x !== f);
  return now.length >= BEFORE_MAX ? now : [...now, f];
}

/** The goal a new member gets (Me.goal): the first view looks for companies with no fractional in their function yet. */
export const goalFor = (fn: string | null): "adjacent" | "friendly" => (namedFn(fn) ? "adjacent" : "friendly");

/* ---------- the first view ---------- */

/** The window the first view opens on, in months, and the one it widens to. */
export const FIRST_WINDOW = 12;
export const WIDER_WINDOW = 24;
/** A first view with fewer companies than this widens (in order), so it shows enough to be worth saving. */
export const ENOUGH = 5;
/** Rows the first view step shows. */
export const PREVIEW_ROWS = 3;

/**
 * What the first view gave up to show enough, in the order it tries: a 24 month window, then
 * companies that have a fractional in the member's function already, then companies outside their
 * profile. Only when that still finds nothing: any time, then any function, so it is never empty
 * while the table has a hire.
 */
export type Widened = "window" | "notMine" | "icp" | "anyTime" | "anyFn";

export interface FirstView {
  /** The view's filters: hiredFn, hiredWithin, notMine and icp. */
  f: Filters;
  /** "Not sure": the view uses the suggested functions. */
  guessed: boolean;
  widened: Widened[];
  /** Companies the view had before it widened. */
  first: number;
  /** Every company it lists, the most recent hire first: the table's order when it opens on the view. */
  rows: Row[];
  /** Of those, the companies whose hire has its seat holder on file (behind a lock): potential referral partners. */
  holders: number;
  /** The saved view: its place (the table's address), name and what the weekly email follows. */
  place: string;
  name: string;
  criteria: SavedViewCriteria;
}

/** The member as the table filters for them, with onboarding's answers in place of what is saved. */
const asMember = (me: Me, fn: string | null, icp: Icp | null): Me => ({ ...me, function: fn, icp });

/** A hire whose seat holder is on file: behind a lock for the member (or theirs to see). Never their name here. */
export const holderOnFile = (e: EngagementRec | null | undefined) => !!e && (e.cells.operator?.s === "locked" || e.cells.operator?.s === "value");

/**
 * The first view for these answers. `before` is the member's answer ([] is "Not sure": the
 * `suggested` functions stand in). It widens while it lists fewer than ENOUGH companies, keeping
 * only the steps that add some (see Widened).
 */
export function firstView(infos: CoInfo[], me: Me, a: { fn: string | null; icp: Icp | null; before: string[]; suggested: string[] }): FirstView {
  const who = asMember(me, a.fn, a.icp);
  const guessed = !a.before.length;
  const fns = (guessed ? a.suggested : a.before).filter((f) => FUNCTIONS.includes(f)).slice(0, BEFORE_MAX);
  const all = rowsFor("companies", infos);
  const list = (f: Filters) => applyFilters(all, f, "all", "", who, true).rows;
  let f: Filters = { ...EMPTY_FILTERS, hiredFn: fns, hiredWithin: FIRST_WINDOW, notMine: !!namedFn(a.fn), icp: !icpEmpty(a.icp) };
  let rows = list(f);
  const first = rows.length;
  const widened: Widened[] = [];
  const steps: [Widened, (x: Filters) => Filters | null, number][] = [
    ["window", (x) => (x.hiredWithin > 0 && x.hiredWithin < WIDER_WINDOW ? { ...x, hiredWithin: WIDER_WINDOW } : null), ENOUGH],
    ["notMine", (x) => (x.notMine ? { ...x, notMine: false } : null), ENOUGH],
    ["icp", (x) => (x.icp ? { ...x, icp: false } : null), ENOUGH],
    ["anyTime", (x) => (x.hiredWithin > 0 ? { ...x, hiredWithin: 0 } : null), 1],
    ["anyFn", (x) => (x.hiredFn.length ? { ...x, hiredFn: [] } : null), 1],
  ];
  for (const [key, next, want] of steps) {
    if (rows.length >= want) continue;
    const nf = next(f);
    if (!nf) continue;
    const nr = list(nf);
    // A step that adds nothing is left out, so the view (and the line that explains it) stays as narrow as it can.
    if (nr.length <= rows.length) continue;
    f = nf;
    rows = nr;
    widened.push(key);
  }
  return {
    f,
    guessed,
    widened,
    first,
    rows: sortRows(rows, "hired", false, "", { me: who, hire: { fns: f.hiredFn, within: f.hiredWithin } }),
    holders: rows.filter((r) => holderOnFile(hireOfRow(r, f.hiredFn, f.hiredWithin))).length,
    place: absolutePlace({ t: "companies", v: "all", s: null, f, q: "" }),
    name: viewName(f, "all", "companies", null, a.fn),
    criteria: criteriaOf(withIcpSpelled(f, a.icp), null),
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** "Marketing", "Marketing and RevOps", "Marketing, RevOps and Finance". */
export const andList = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * The first view in one sentence, the owner's words: "23 companies in your profile hired a
 * fractional Marketing or RevOps leader in the last 12 months and have no fractional Sales yet."
 */
export function firstViewLine(v: Pick<FirstView, "f" | "rows">, fn: string | null): string {
  const n = v.rows.length;
  const nfn = namedFn(fn);
  const gap = v.f.notMine && nfn ? ` and ${n === 1 ? "has" : "have"} no fractional ${nfn} yet` : "";
  return `${plural(n, "company", "companies")}${v.f.icp ? " in your profile" : ""} hired ${fnLeader(v.f.hiredFn)} ${windowPhrase(v.f.hiredWithin)}${gap}.`;
}

/** What the first view widened, in one line ("Only 2 matched at first, so we looked back 24 months."). Null when it didn't. */
export function widenLine(v: Pick<FirstView, "widened" | "first">, fn: string | null): string | null {
  if (!v.widened.length) return null;
  const nfn = namedFn(fn);
  const words: Record<Widened, string> = {
    window: `looked back ${WIDER_WINDOW} months`,
    notMine: nfn ? `added companies with a fractional ${nfn} already` : "added companies with a fractional in your function already",
    icp: "looked past your profile",
    anyTime: "looked back as far as our records go",
    anyFn: "counted hires in every function",
  };
  return `${v.first === 0 ? "Nothing matched" : `Only ${v.first} matched`} at first, so we ${andList(v.widened.map((k) => words[k]))}.`;
}

/** "Not sure": which functions the view uses instead, and why. Null when the member picked their own. */
export function guessLine(v: Pick<FirstView, "f" | "guessed">, fn: string | null): string | null {
  if (!v.guessed || !v.f.hiredFn.length) return null;
  const nfn = namedFn(fn);
  return `Not sure is fine. This starts with ${andList(v.f.hiredFn)}, who often get hired before ${nfn ? `a fractional ${nfn} leader` : "you"}.`;
}

/**
 * How many companies in the view have the seat holder of their hire on file, as one line (null at
 * none): the fractionals who held those seats are the member's potential referral partners.
 */
export function holdersLine(v: Pick<FirstView, "holders" | "rows">): string | null {
  const k = v.holders;
  if (!k) return null;
  if (k === 1) return `${v.rows.length === 1 ? "The" : "At 1 of them, the"} fractional who held that seat is on file, a potential referral partner.`;
  return `At ${k === v.rows.length ? `all ${k}` : `${k} of them`}, the fractional who held that seat is on file. Each is a potential referral partner.`;
}

/** Open roles in the member's function that fit their profile: what "Also show open <function> roles" saves as a second view. */
export function openRolesCount(infos: CoInfo[], me: Me, fn: string | null, icp: Icp | null): number {
  const nfn = namedFn(fn);
  if (!nfn) return 0;
  return applyFilters(rowsFor("engagements", infos), { ...EMPTY_FILTERS, fn: [nfn], icp: !icpEmpty(icp) }, "hiring", "", asMember(me, fn, icp), true).rows.length;
}

/* ---------- picking up where the member left off ---------- */

/**
 * Which copy of the answers to go on from: this tab's (a reload) or the server's (another tab or
 * device), whichever was saved later. Each carries the time the browser that saved it did.
 */
export function newerAnswers<T extends { at?: string | null }>(tab: T | null | undefined, server: T | null | undefined): T | null {
  if (!tab) return server ?? null;
  if (!server) return tab;
  const a = Date.parse(tab.at ?? "");
  const b = Date.parse(server.at ?? "");
  if (!Number.isFinite(b)) return tab;
  if (!Number.isFinite(a)) return server;
  return a >= b ? tab : server;
}

/**
 * The step to open on: the one asked for, inside the flow, but never past an answer it needs.
 * Everything after the first step needs the function, and the first view needs the "before" answer.
 */
export function resumeStep(want: number, a: { fn: string | null; before: string[] | null }, total: number): number {
  const s = Math.min(Math.max(1, Math.round(want) || 1), total);
  if (!a.fn) return 1;
  if (s > 3 && a.before === null) return 3;
  return s;
}

/**
 * Hiring now (HiringNow.dc.html, Signals / Hiring now in the new look), as pure data so
 * scripts/test-hiring.mts reads it with no browser: which open roles each view lists, what each
 * column says for a role, the fit and its why, the way in, the status (New, Seen, Pitched), the
 * sorts, the words under each heading, and the "role posted" list alert (F5) the page saves.
 *
 * Every word here comes from what Merlin holds and the member can see. A locked company is
 * described by its free facts and its id, never named. A rate shows only when the posting gave one
 * ("No rate posted" otherwise), and while it is locked it reads "On file", never a guess.
 *
 *   Views     mine (the member's function, the default when they have one), all (every function),
 *             pitched (roles at companies the member wrote to), closed (roles that came down in
 *             the last 30 days, the bottom tab).
 *   Fit       0 Not your function, 1 Possible, 2 Good, 3 Strong: the role's function against the
 *             member's, then the company against their ideal client (model.ts icpParts), with one
 *             short why. Words only, no score.
 *   Way in    the member's own ways in (Warm paths, lib/paths) when they are on, else what the
 *             company's seats say: a seat the member held there, or a fellow fractional who held
 *             one (free to name once the company is open), else "No path yet".
 *   Status    Pitched (the member wrote to the company: their pipeline at Sent or later), New
 *             (first seen since their last visit, and not opened here yet), else Seen.
 */
import { closestOf } from "../workbench/closest";
import type { EngagementRec, Me, SavedViewRec } from "@/lib/tableTypes";
import type { ColumnDef, Fill } from "../workbench/columns";
import {
  absolutePlace, criteriaOf, dayOf, icpMatch, icpParts, icpUnknown, isOpenRole, namedFn, newThisWeek, openSince, shown, sortRows, withIcpSpelled,
  type CoInfo, type Filters, type HireCounts, type Row, type SortKey,
} from "../model";

export type HireView = "mine" | "all" | "pitched" | "closed";
export type HireChip = "fresh" | "rate" | "path" | "icp";
export type HireSort = "newest" | "best" | "fn" | "employees" | "revenue" | "hq";

const DAY = 86_400_000;
const pct = (n: number, of: number) => (of ? Math.round((100 * n) / of) : 0);

/** The open role a row stands for (Hiring now lists seat rows). */
export const roleOf = (r: Row): EngagementRec => r.e!;
export const fnOf = (e: EngagementRec) => shown(e.cells.function);

/* ---------- which roles ---------- */

/** Roles that came down in the last `days` days, newest first: the "Closed in the last 30 days" tab. */
export function closedLately(rows: readonly Row[], now = Date.now(), days = 30): Row[] {
  const cut = now - days * DAY;
  return rows
    .filter((r) => {
      const e = r.e;
      if (!e || !e.closed || !e.opened) return false;
      const t = Date.parse(e.closedAt ?? `${e.closed}T00:00:00Z`);
      return Number.isFinite(t) && t >= cut;
    })
    .sort((a, b) => (b.e!.closedAt ?? b.e!.closed ?? "").localeCompare(a.e!.closedAt ?? a.e!.closed ?? ""));
}

/** The view's rows from the open roles in play (the filters applied): the member's function, every function, or the ones they pitched. */
export function inView(rows: readonly Row[], view: HireView, myFn: string | null, pitched: (r: Row) => boolean): Row[] {
  if (view === "mine" && myFn) return rows.filter((r) => r.e && fnOf(r.e) === myFn);
  if (view === "pitched") return rows.filter(pitched);
  return [...rows];
}

/* ---------- the columns' words ---------- */

/** When the role was listed, the way the row says it: "Nov 22", "Today", and whether it is new this week (the dot). */
export function listedOf(e: EngagementRec, now = Date.now()): { day: string; ago: string; fresh: boolean } {
  const fmt = (iso: string) => dayOf(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  if (e.closed) return { day: `Closed ${fmt(e.closed)}`, ago: e.opened ? `Listed from ${fmt(e.opened)}` : "", fresh: false };
  const since = openSince(e);
  if (!since) return { day: "Not dated", ago: "", fresh: false };
  const days = Math.max(0, Math.floor((now - dayOf(since).getTime()) / DAY));
  const ago = e.unseen ? "May be closed" : days === 0 ? "Today" : days === 1 ? "Yesterday" : `${days} days ago`;
  return { day: fmt(since), ago, fresh: newThisWeek(e, now) };
}

/**
 * The posted rate, as the row may show it:
 *   none   the posting gave no rate ("No rate posted"), never a guess;
 *   with   on file, and it opens with the company (the company is locked);
 *   buy    on file, the company is open: the posting, its rate and hours are one purchase;
 *   value  the member sees it.
 */
export type RateState = "none" | "with" | "buy" | "value";
export function rateOf(r: Row): RateState {
  const c = r.e?.cells.rate;
  if (!c || c.s === "empty") return "none";
  // A value the member reported reads as the table draws it (engCell), never as a lock.
  if (c.s !== "locked") return "value";
  return r.i.c.hidden ? "with" : "buy";
}
/** The posted hours: "Not posted", "On file" (locked), or the hours a week. */
export function hoursOf(r: Row): { text: string; sub: string; known: boolean } {
  const c = r.e?.cells.hours;
  if (!c || c.s === "empty") return { text: "Not posted", sub: "", known: false };
  if (c.s !== "value") return { text: "On file", sub: r.i.c.hidden ? "With the company" : "With the posting", known: true };
  return { text: c.v.replace(/\s*(hours?|hrs?)\s*(a|per|\/)?\s*(week|wk)?\s*$/i, ""), sub: "a week", known: true };
}

/** The company's past fractional hires, free: "2 hires: Sales, RevOps", "None on file". */
export function pastHires(i: CoInfo): string {
  const f = i.c.friendly;
  if (!f.fractional) return "None on file";
  const fns = f.functions.slice(0, 3);
  return `${f.fractional} ${f.fractional === 1 ? "hire" : "hires"}${fns.length ? `: ${fns.join(", ")}` : ""}`;
}
/** Size and HQ, both free: ["51–200 people", "Texas"]. */
export function sizeHq(i: CoInfo): { size: string; hq: string } {
  const emp = shown(i.c.cells.employees);
  return { size: emp ? `${emp} people` : "Size not on file", hq: shown(i.c.cells.hq) ?? "HQ not on file" };
}

/* ---------- fit to the member ---------- */

export const FIT_LABEL = ["Not your function", "Possible", "Good", "Strong"] as const;
export interface Fit {
  tier: 0 | 1 | 2 | 3;
  label: (typeof FIT_LABEL)[number];
  why: string;
}

/**
 * How a role fits the member: another function is "Not your function" (pass it on); then the
 * company against their ideal client. A confirmed match is Strong where the company hired
 * fractionals before, else Good; a maybe (a part not on file) is Good with past hires, else
 * Possible; a known part that conflicts is Possible. Without an ideal client, their function is Good.
 */
export function fitOf(r: Row, me: Pick<Me, "function" | "icp">): Fit {
  const e = r.e;
  const i = r.i;
  const mine = namedFn(me.function);
  const fn = e ? fnOf(e) : null;
  const mk = (tier: Fit["tier"], why: string): Fit => ({ tier, label: FIT_LABEL[tier], why });
  if (mine && fn && fn !== mine) return mk(0, `${fn}, not ${mine}`);
  const m = icpMatch(me.icp, i.c);
  const hired = i.c.friendly.fractional > 0;
  const ind = shown(i.c.cells.industry);
  const rev = shown(i.c.cells.revenue);
  const emp = shown(i.c.cells.employees);
  if (m === null) return mk(fn && mine && fn === mine ? 2 : 1, fn && mine && fn === mine ? `${fn}, your function` : "Set your ideal client to see the fit");
  if (m === "match") return mk(hired ? 3 : 2, [ind, rev ?? emp].filter(Boolean).join(", ") + (hired ? ", hired fractionals before" : ""));
  if (m === "maybe") return mk(hired ? 2 : 1, icpUnknown(me.icp, i.c) ?? "Some of it not on file");
  // A known part conflicts: say which one.
  const p = icpParts(me.icp!, i.c);
  const why =
    p.industry === false && ind ? `${ind}, outside your industries`
    : p.employees === false && emp ? `${emp} people, outside your sizes`
    : p.revenue === false && rev ? `${rev}, outside your revenue`
    : "Outside your ideal client";
  return mk(1, why);
}

/* ---------- the way in ---------- */

/** The member's ways in by company (Warm paths, GET /api/paths?map=1), when they are on. */
export type WayMap = ReadonlyMap<string, { via: string | null; best: number | null; locked: boolean }>;
export interface WayIn {
  text: string;
  sub: string;
  has: boolean;
}

/**
 * The way in a row shows. Warm paths' best route when the member has one ("Through Casey Morgan,
 * then Rita Vance", with its estimated success). Otherwise what the seats say: a seat the member
 * held there, or a fellow fractional who held one (named once the company is open, free), else
 * "No path yet". `first`: a first visit, when the next step is bringing in who you know.
 */
export function wayOf(r: Row, ways: WayMap | null, first = false): WayIn {
  const i = r.i;
  const w = ways?.get(i.c.id);
  if (w?.via && !i.c.hidden) return { text: w.via, sub: w.best != null ? `Estimated success ${w.best}%` : "From Warm paths", has: true };
  if (i.engs.some((e) => e.yours)) return { text: "You held a seat here", sub: "Your own way in", has: true };
  const held = i.engs.filter((e) => !isOpenRole(e) && !e.yours && (e.cells.operator?.s === "value" || e.cells.operator?.s === "locked"));
  if (held.length) {
    if (i.c.hidden) return { text: "Through a fractional", sub: "Name shows when open", has: true };
    const named = held.find((e) => e.cells.operator?.s === "value");
    if (named && named.cells.operator?.s === "value") return { text: `Through ${named.cells.operator.v}`, sub: "Held a seat here", has: true };
    return { text: "Through a fractional", sub: "1 credit shows who held the seat", has: true };
  }
  if (w && w.best != null) return { text: "Through someone you know", sub: i.c.hidden ? "Name shows when open" : `Estimated success ${w.best}%`, has: true };
  return { text: "No path yet", sub: first ? "Bring in who you know" : "Find one in Warm paths", has: false };
}

/* ---------- status ---------- */

/** The member's pipeline as status reads it: each company's stage and when they wrote (Sent or later). */
export type PipeMap = ReadonlyMap<string, { stage: string; sent: string | null }>;
export interface StatusCtx {
  /** The member's previous visit (ISO), or null on a first visit. */
  since: string | null;
  /** Roles opened on this page (the member's own browser). */
  seen: ReadonlySet<string>;
  pipe: PipeMap;
  /** Leads the member passed here this visit: role id to the fractional's first name. */
  passed?: ReadonlyMap<string, string>;
}
export interface Status {
  k: "new" | "seen" | "pitched";
  /** "New to you": not opened since the member's last visit, which is not the same as listed this week ("new this week"). */
  label: "New to you" | "Seen" | "Pitched";
  sub: string;
}
const WROTE = new Set(["sent", "replied", "meeting", "proposal", "won"]);
export const pitchedAt = (r: Row, pipe: PipeMap) => {
  const p = pipe.get(r.i.c.id);
  return p && WROTE.has(p.stage) ? p : null;
};
export function statusOf(r: Row, x: StatusCtx): Status {
  const e = r.e!;
  const p = x.pipe.get(r.i.c.id);
  const passed = x.passed?.get(e.id);
  if (p && WROTE.has(p.stage)) return { k: "pitched", label: "Pitched", sub: passed ? `Passed to ${passed}` : p.sent ? dayOf(p.sent).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) : "" };
  const sub = passed ? `Passed to ${passed}` : p ? "In pipeline" : "";
  const firstSeen = e.openedAt ?? (e.opened ? `${e.opened}T00:00:00Z` : null);
  const fresh = !x.seen.has(e.id) && (!x.since || (!!firstSeen && firstSeen > x.since));
  return fresh ? { k: "new", label: "New to you", sub } : { k: "seen", label: "Seen", sub };
}

/* ---------- the chips and the sorts ---------- */

export const CHIP_LABEL: Record<HireChip, string> = { fresh: "New this week", rate: "Rate posted", path: "I have a way in", icp: "My ideal client" };
export function chipTest(chip: HireChip, r: Row, x: { ways: WayMap | null; me: Pick<Me, "function" | "icp">; now?: number }): boolean {
  const e = r.e!;
  if (chip === "fresh") return newThisWeek(e, x.now);
  if (chip === "rate") return rateOf(r) !== "none";
  if (chip === "path") return wayOf(r, x.ways).has;
  return icpMatch(x.me.icp, r.i.c) === "match";
}

export const HIRE_SORTS: { key: HireSort; label: string }[] = [
  { key: "newest", label: "Newest first" },
  { key: "best", label: "Best fit first" },
  { key: "fn", label: "Function, A to Z" },
  { key: "employees", label: "Most people first" },
  { key: "revenue", label: "Highest revenue first" },
  { key: "hq", label: "HQ, A to Z" },
];
/** A table sort the page reads as its own (an address or a saved view), else Newest first. */
export const hireSortOf = (s: SortKey | null | undefined): HireSort => (HIRE_SORTS.some((x) => x.key === s) ? (s as HireSort) : "newest");

/** Newest by the day listed (posted, else first seen); Best fit by the fit, then Merlin's best fit; the rest as the table sorts them. */
export function sortRoles(rows: readonly Row[], sort: HireSort, me: Pick<Me, "function" | "icp">): Row[] {
  const when = (r: Row) => (r.e?.closed ? r.e.closedAt ?? r.e.closed : openSince(r.e!) ?? "");
  const byKey = (a: Row, b: Row) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  if (sort === "newest") return [...rows].sort((a, b) => when(b).localeCompare(when(a)) || byKey(a, b));
  if (sort === "best") {
    const tier = new Map(rows.map((r) => [r.key, fitOf(r, me).tier]));
    const ranked = sortRows([...rows], "best", false, "", { me });
    const at = new Map(ranked.map((r, n) => [r.key, n]));
    return [...rows].sort((a, b) => tier.get(b.key)! - tier.get(a.key)! || at.get(a.key)! - at.get(b.key)!);
  }
  return sortRows([...rows], sort, false, "", { me });
}

/* ---------- the columns ---------- */

/** What the columns read about a row besides the row itself. */
export interface ColCtx {
  me: Pick<Me, "function" | "icp">;
  ways: WayMap | null;
  status: StatusCtx;
  first: boolean;
  now?: number;
}

const col = (id: string, label: string, width: string, words: (rows: readonly Row[]) => string, extra: Partial<ColumnDef> = {}): ColumnDef => ({
  id,
  type: "engagements",
  label,
  cost: "free",
  word: "",
  fill: (): Fill => "value",
  words,
  width,
  ...extra,
});

/**
 * Hiring now's columns, in the mockup's order. The nine it shows before the member adds one, then
 * three more: Closest evidence (Evidence Bank, a Close feature: the member's case most like each company, workbench/closest.ts),
 * Size and HQ, and Past fractional hires (both free). Each heading's line says how much of the
 * column is in the rows in view, in the column's own words.
 */
export function hiringColumns(x: ColCtx): ColumnDef[] {
  const count = (rows: readonly Row[], test: (r: Row) => boolean) => rows.filter(test).length;
  return [
    col("role", "Role", "minmax(160px, 1.4fr)", (rows) => `${rows.length} ${rows.length === 1 ? "role" : "roles"}`, { def: true, fixed: true }),
    col("fn", "Function", "minmax(92px, 0.6fr)", (rows) => {
      const n = new Set(rows.map((r) => fnOf(r.e!) ?? "")).size;
      return `${n} ${n === 1 ? "function" : "functions"}`;
    }, { def: true, sort: "fn" }),
    col("company", "Company", "minmax(180px, 1.3fr)", (rows) => `${pct(count(rows, (r) => !r.i.c.hidden), rows.length)}% open`, { def: true, fixed: true, cost: 2, tip: "Its name, website and the postings of its open roles open with the company. Free on Trial, Pro and Close, up to 15 a day." }),
    col("listed", "Listed", "minmax(88px, 0.6fr)", (rows) => `${count(rows, (r) => newThisWeek(r.e!, x.now))} this week`, { def: true }),
    col("rate", "Rate", "minmax(110px, 0.7fr)", (rows) => `${pct(count(rows, (r) => rateOf(r) !== "none"), rows.length)}% posted a rate`, { def: true, cost: 1, needs: "Comes with the posting", tip: "The rate the posting gave. No rate posted when it gave none." }),
    col("hours", "Hours", "minmax(70px, 0.5fr)", (rows) => `${pct(count(rows, (r) => hoursOf(r).known), rows.length)}% posted`, { def: true, num: true }),
    col("fit", "Fit to you", "minmax(124px, 0.8fr)", (rows) => `${pct(count(rows, (r) => fitOf(r, x.me).tier >= 2), rows.length)}% strong or good`, { def: true, sort: "best" }),
    col("way", "Your way in", "minmax(150px, 1.1fr)", (rows) => `${pct(count(rows, (r) => wayOf(r, x.ways, x.first).has), rows.length)}% have a path`, { def: true }),
    col("status", "Status", "minmax(88px, 0.6fr)", (rows) => `${count(rows, (r) => statusOf(r, x.status).k === "new")} new to you`, { def: true }),
    col("evidence", "Closest evidence", "minmax(170px, 1fr)", (rows) => `${pct(count(rows, (r) => !!closestOf(r.i.c.id)), rows.length)}% matched`, { plan: "close", tip: "Your closest case study for this role. Evidence Bank, on the Close plan." }),
    col("sizeHq", "Size and HQ", "minmax(150px, 0.9fr)", (rows) => `${pct(count(rows, (r) => !!shown(r.i.c.cells.employees)), rows.length)}% on file`, { sort: "employees" }),
    col("past", "Past fractional hires", "minmax(140px, 0.8fr)", (rows) => `${pct(count(rows, (r) => r.i.c.friendly.fractional > 0), rows.length)}% hired before`),
  ];
}
export const HIRING_DEFAULT_COLS = ["role", "fn", "company", "listed", "rate", "hours", "fit", "way", "status"];
export const HIRING_EXTRA_COLS = ["evidence", "sizeHq", "past"] as const;

/* ---------- the "role posted" alert (F5) ---------- */

/** What the alert waits for: "a Sales role is posted", "any role is posted", "a role like these is posted". */
export function alertWhat(view: HireView, myFn: string | null, f: Pick<Filters, "fn">): string {
  const fns = f.fn.length ? f.fn : view === "mine" && myFn ? [myFn] : [];
  if (fns.length === 1) return `a ${fns[0]} role is posted`;
  if (fns.length > 1) return `a ${fns.slice(0, -1).join(", ")} or ${fns[fns.length - 1]} role is posted`;
  return "any role is posted";
}
export const alertTitle = (view: HireView, myFn: string | null, f: Pick<Filters, "fn">) => `Tell me when ${alertWhat(view, myFn, f)}`;
/** The list's name before the member types one: "Sales roles for me", "All open roles". */
export function alertName(view: HireView, myFn: string | null, f: Pick<Filters, "fn" | "industry">): string {
  const fns = f.fn.length ? f.fn : view === "mine" && myFn ? [myFn] : [];
  const ind = f.industry.length === 1 ? ` in ${f.industry[0]}` : "";
  if (view === "mine" && myFn && !f.fn.length) return `${myFn} roles for me${ind}`;
  if (fns.length) return `${fns.join(" or ")} roles${ind}`;
  return ind ? `Open roles${ind}` : "All open roles";
}
/** What the saved list keeps, as chips: "Function: Sales", "Industry: SaaS", "Your ideal client". */
export function alertKeeps(view: HireView, myFn: string | null, f: Filters): string[] {
  const fns = f.fn.length ? f.fn : view === "mine" && myFn ? [myFn] : [];
  return [
    fns.length ? `Function: ${fns.join(", ")}` : "Every function",
    ...(f.industry.length ? [`Industry: ${f.industry.join(", ")}`] : []),
    ...(f.employees.length ? [`People: ${f.employees.join(", ")}`] : []),
    ...(f.revenue.length ? [`Revenue: ${f.revenue.join(", ")}`] : []),
    ...(f.hq.length ? [`HQ: ${f.hq.join(", ")}`] : []),
    ...(f.country.length ? [`Country: ${f.country.join(", ")}`] : []),
    ...(f.icp ? ["Your ideal client"] : []),
  ];
}

/** Where the saved list opens: the table's Hiring now, with every function when that view is on. */
export function hirePlace(view: HireView, f: Filters, sort: HireSort | null): string {
  return absolutePlace({ t: "engagements", v: "hiring", s: sort && sort !== "hq" ? sort : null, f, q: "", all: view === "all" });
}

/** The save action's body for a list of roles with its alert (the weekly email, and Slack when roles open). */
export function alertSaveBody(x: { view: HireView; myFn: string | null; f: Filters; icp: Me["icp"]; sort: HireSort | null; name: string; slack: boolean }) {
  return {
    type: "savedView" as const,
    op: "save" as const,
    name: x.name,
    email: true,
    place: hirePlace(x.view, x.f, x.sort),
    criteria: criteriaOf(withIcpSpelled(x.f, x.icp), x.view === "mine" ? x.myFn : null),
    list: { kind: "roles" as const, alert: { on: true, email: true, slack: x.slack } },
  };
}

/** The member's other saved lists of roles (a Hiring now place, or kind roles), for "Alerts on your other saved views". */
export function roleLists(views: readonly SavedViewRec[], here: string | null): SavedViewRec[] {
  return views.filter((v) => v.place !== here && (v.kind === "roles" || (!!v.place && new URLSearchParams(v.place).get("v") === "hiring")));
}

/* ---------- the line under the table ---------- */

/**
 * What a count of roles counts, said with it, so two counts on screen never look alike when they
 * count different things: "10 open Sales roles, none in your ideal client", "3 open roles in your
 * ideal client", "13 open roles", "2 roles you pitched", "4 roles closed in the last 30 days".
 * The numbers come from model.ts hireCounts.
 */
export function rolesWords(n: number, x: { view: HireView; myFn: string | null; icpOn: boolean; lifted: boolean }): string {
  const num = n.toLocaleString("en-US");
  const roles = n === 1 ? "role" : "roles";
  if (x.view === "closed") return `${num} ${roles} closed in the last 30 days`;
  if (x.view === "pitched") return `${num} ${roles} you pitched`;
  const fn = x.view === "mine" && x.myFn ? `${x.myFn} ` : "";
  if (x.view === "mine" && x.lifted) return `${num} open ${fn}${roles}, none in your ideal client`;
  return `${num} open ${fn}${roles}${x.icpOn ? " in your ideal client" : ""}`;
}

/** What the default view lists and counts (the sidebar's Hiring now count is the same): the member's function, lifted when none of it fits. */
export const listedCount = (h: Pick<HireCounts, "fn" | "all" | "listedMine">) => (h.fn ? h.listedMine.length : h.all.length);

export function footWords(x: { view: HireView; shown: number; total: number; mine: number; myFn: string | null; filtered: boolean; pitched: number; icpOn?: boolean }): { text: string; go: { label: string; to: HireView | "clear" } | null } {
  if (!x.shown && x.filtered) return { text: "No open roles match these filters.", go: { label: "Clear filters", to: "clear" } };
  if (x.view === "pitched")
    return { text: x.pitched ? `${x.pitched} ${x.pitched === 1 ? "role" : "roles"} at companies you wrote to. They are in your pipeline too.` : "Nothing pitched yet. Draft a note from a role and mark it sent, and it moves here.", go: { label: "Show all functions", to: "all" } };
  if (x.view === "closed") return { text: "Roles that came down in the last 30 days. A company that just filled a role often needs help around it.", go: { label: "Back to open roles", to: x.myFn ? "mine" : "all" } };
  if (x.view === "mine" && x.myFn) {
    const rest = x.total - x.mine;
    const where = x.icpOn ? " in your ideal client" : "";
    return { text: rest > 0 ? `${rest} more open ${rest === 1 ? "role" : "roles"} in other functions${where}. Pass one to a fractional who fits and earn 5 credits.` : `Every open role${x.icpOn ? " in your ideal client" : " on file"} is in ${x.myFn}.`, go: rest > 0 ? { label: "Show all functions", to: "all" } : null };
  }
  return { text: x.myFn ? `Every function is showing. ${x.mine} of these ${x.total} roles are in ${x.myFn}, your function.` : `Every open role on file, ${x.total} in all.`, go: x.myFn ? { label: `Only ${x.myFn}`, to: "mine" } : null };
}

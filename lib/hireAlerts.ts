/**
 * New hires for saved views that follow hires ("Recently hired", lib/hired.ts): the companies
 * that newly match one, for the weekly email (lib/table.ts digestList) and the weekly post in
 * Slack and webhooks (lib/notify/events.ts). Server only.
 *
 * New means a matching seat was added to the table in the window, the week before the email:
 *   - a seat a member added: when they added it (State.engagements[].at);
 *   - a seat from our records: the day it came in (SeedEngagement.addedAt, which
 *     scripts/add-seat-scan.mjs stamps on the seats it adds). Seats from before that day carry
 *     none and are never new, so a rebuilt seed doesn't read as a week of hires;
 *   - an open role a member filled: the day they named its seat holder (it became a hire then).
 *
 * A view matches the way the table shows it. Its place (the app's address query) is read with the
 * app's own filters (app/post/model.ts) against the member's own view of the table (buildView, as
 * a member), so the email lists what reopening the view lists: the Ideal Fractional Profile as the
 * member has it now, "No fractional Sales yet" in their function, the other filters. Free facts
 * only: a company that is locked for the member is left unnamed, and no seat holder is named.
 *
 * Leadership seats only, like the table (isLeaderHire): the view marks a seat whose stored title
 * reads below Lead (EngagementRec.belowLead), and hiresOf and the filter leave it out, so a new
 * "Fractional Finance Manager" seat is never "a fractional Finance leader" in the email or Slack.
 */
import { buildView, loadSeed, loadState, tableInternals as T, type Member, type Seed, type State } from "./table";
import type { SavedSearch } from "./mcp/alerts";
import { followsHires, hireMonth } from "./hired";
import { EMPTY_FILTERS, ICP_FREE_TABS, applyFilters, deriveAll, hiredOn, hiresOf, icpEmpty, placeFilters, rowsFor, shown, type Filters, type Tab } from "@/app/post/model";

/** One company that newly matches, in free facts: never a locked company's name, never who held the seat. */
export interface HireRow {
  /** The company's public id (its record in the app). */
  companyId: string;
  /** Null while the company is locked for the member (it has an open role they haven't unlocked). */
  company: string | null;
  /** The new hire's function and start month ("2026-03", or a year alone). */
  function: string | null;
  start: string | null;
}

/** A saved view's new matches this week. */
export interface HireMatch {
  viewId: string;
  name: string;
  /** Companies that newly match. */
  n: number;
  /** The functions the view follows (empty: any function). */
  functions: string[];
  /** The view narrows to the member's Ideal Fractional Profile ("in your profile"). */
  inProfile: boolean;
  /** The view's place in the app (an address query), or null for a search saved in Claude. */
  place: string | null;
  /** Up to `ROWS`, the most recent hire first. */
  rows: HireRow[];
}

/** Rows a match carries (the email lists 5, a Slack post 3). */
export const HIRE_ROWS = 5;

/** When each seat on the table was added, in ms, by public id. A seat with no known day is left out (never new). */
export function seatAddedTimes(seed: Seed, s: State): Map<string, number> {
  const out = new Map<string, number>();
  const put = (id: string, at: string | undefined | null) => {
    const ms = Date.parse(at ?? "");
    if (Number.isFinite(ms)) out.set(T.pubId(id), ms);
  };
  for (const e of seed.engagements) put(e.id, (e as { addedAt?: string }).addedAt);
  for (const e of s.engagements) {
    // A posting the scan added is no hire until a member names who took the seat: it counts from then.
    if (e.source === "Demand scan" || e.by === "scan") {
      const v = s.values[`${e.id}.operator`];
      if (v?.status === "live") put(e.id, v.at);
      continue;
    }
    put(e.id, e.at);
  }
  return out;
}

/** The seat-added times for the committed state, read once per run (the weekly email, a scan's posts). */
export async function seatAdded(): Promise<Map<string, number>> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  return seatAddedTimes(seed, s);
}

/** What a saved view reads: its place when it has one, else its criteria (hire functions and window, the company lists). */
function viewFilters(v: SavedSearch): { f: Filters; tab: Tab; q: string } {
  const p = v.place ? placeFilters(v.place) : null;
  const f: Filters = p
    ? { ...p.f }
    : {
        ...EMPTY_FILTERS,
        industry: v.industry ?? [],
        employees: v.employees ?? [],
        revenue: v.revenue ?? [],
        country: v.country ?? [],
        hq: v.hq ? [v.hq] : [],
      };
  // A place written before the view followed hires, or none: the criteria say what it follows.
  if (!hiredOn(f)) {
    f.hiredFn = [...(v.hiredFn ?? [])];
    f.hiredWithin = v.hiredWithin ?? 0;
  }
  return { f, tab: p?.v ?? "all", q: p?.q ?? "" };
}

/**
 * The member's saved views that follow hires, with the companies each newly matches: a matching
 * seat added after `sinceMs` and by `nowMs`. Views with no new match are left out. `added` comes
 * from seatAdded() (one read for a whole run).
 */
export async function newHires(m: Member, views: SavedSearch[], sinceMs: number, nowMs: number, added: Map<string, number>): Promise<HireMatch[]> {
  const mine = views.filter(followsHires);
  if (!mine.length) return [];
  // The member's own table, as a member sees it: a locked company stays locked (an admin's too).
  const view = await buildView(m.token, { asMember: true });
  const me = view.me;
  if (!me) return [];
  const infos = deriveAll(view.companies);
  const companies = rowsFor("companies", infos);
  const out: HireMatch[] = [];
  for (const v of mine) {
    const { f, tab, q } = viewFilters(v);
    const rows = applyFilters(companies, f, tab, q, me, true).rows;
    const hits: { row: HireRow; ym: string; at: number }[] = [];
    for (const r of rows) {
      const fresh = hiresOf(r.i, f.hiredFn, f.hiredWithin, nowMs).filter((e) => {
        const at = added.get(e.id);
        return at !== undefined && at > sinceMs && at <= nowMs;
      });
      if (!fresh.length) continue;
      // The newest of them: hiresOf lists the most recent start first.
      const e = fresh[0];
      hits.push({
        row: { companyId: r.i.c.id, company: r.i.c.hidden ? null : r.i.c.name, function: shown(e.cells.function), start: shown(e.cells.start) },
        ym: hireMonth(shown(e.cells.start)) ?? "",
        at: added.get(e.id) ?? 0,
      });
    }
    if (!hits.length) continue;
    hits.sort((a, b) => b.ym.localeCompare(a.ym) || b.at - a.at);
    out.push({
      viewId: v.id,
      name: v.name,
      n: hits.length,
      functions: [...f.hiredFn],
      inProfile: f.icp && !icpEmpty(me.icp) && !ICP_FREE_TABS.includes(tab),
      place: v.place ?? null,
      rows: hits.slice(0, HIRE_ROWS).map((h) => h.row),
    });
  }
  return out;
}

/**
 * The radar's signals, found in the table (server only). A signal here still carries internal ids
 * and the company's name: lib/radar/present.ts cuts it to what a member's plan shows before
 * anything leaves the server.
 *
 * When each one happened, and what counts:
 *   adjacent    a fractional leadership hire (a hire whose title doesn't read below Lead, as Recently
 *               hired counts them: isLeaderHire in app/post/model.ts) came into the table in the
 *               window: the day a member added the seat, the day the seat scan added it
 *               (SeedEngagement.addedAt), or the day a member named who took an open role
 *               (lib/hireAlerts.ts seatAddedTimes). Its start is in the last HIRE_FRESH_MONTHS: how
 *               much it still says is the timing curve's call (lib/radar/predict.ts timing), per member.
 *   role        an open role first seen by the scan in the window, still open, listed in its last
 *               scan, and posted in the last 14 days when the board says (the weekly email's "new").
 *   seat        a seat's end month was recorded in the window (a member added or corrected it), or
 *               its status became Ended, and it ended in the last 6 months. Leadership seats only.
 *   funding     an event from lib/radar/sources/funding.ts (SEC Form D filings with RN_FUNDING=1, lib/funding).
 *   sales-build the company's career feed went from no full-time sales hires (AE, SDR, BDR) to some,
 *               or rose by two or more in 30 days (State.salesBuild, lib/table.ts noteSalesHires).
 *   departure   a leader the company's own website listed for a function is gone from it, read OK
 *               both times (State.leaderDepartures, lib/table.ts saveLeaders).
 *   tenure      an active fractional seat reached 12 or 19 months (predict.ts TENURE_MARKS: the median and
 *               average of ended seats), on a day of that month spread by the seat. Typical tenure, said so.
 *   rehire      a fractional leadership seat that ended 3 months ago (a year-only end read as its December),
 *               still inside 24 months of its earliest end: the company has hired fractionals before.
 *   arrival     a leader the company's own website didn't list is on it now, read OK both times, team page
 *               both times (State.leaderArrivals, lib/table.ts saveLeaders).
 *   team-build  the career feed's full-time hires in marketing, engineering, finance, people or customer
 *               success rose by two or more in 30 days (State.teamBuild, lib/table.ts noteTeamHires).
 *   headcount   the company's size band rose into one the research ties a seat to (State.headcount).
 *   gap         a team page read in the window shows no leader in a function usual at the company's stage,
 *               and no fractional seat in it is on file (a state, emitted when a reading first shows it).
 * A seat that came with the seed came into Merlin when the seed was built (seed.builtAt).
 * standingSignals: what is still true today, for a day with few fresh events (see there).
 * Firms kept for an admin's review are no clients: nothing there is a signal.
 *
 * Every signal also carries what Crystal Ball's likelihood reads (lib/radar/match.ts scoreFor): the
 * stage (revenue when the seat started, else the company's band now), the ownership type, the
 * company's recent fractional leadership seats, and, for an ended seat, why it ended.
 */
import { tableInternals as T, type Seed, type State } from "../table";
import { FRACTIONAL_TYPES } from "../tableFields";
import { hireMonth, monthsAgo } from "../hired";
import { seatAddedTimes } from "../hireAlerts";
import { titleWithout } from "../scan/clean";
import { siteKey } from "../tableFields";
import type { RadarKind } from "./types";
import type { FundingCompany, FundingEvent } from "./sources/funding";
import {
  GAP_FUNCTIONS, GAP_MIN_BAND, GAP_MIN_SHARE, GAP_STAGES, GAP_STARTS, HEADCOUNT_PRIORS, REHIRE_MONTHS, SIZE_BANDS, TENURE_MARKS, TENURE_UNTIL, countTransitions, dayInMonthMs, isStage, monthIndex, monthSpan, propensity, windowOpensMs,
  type SeatPoint, type TransitionCounts,
} from "./predict";
import { fnKnow, teamReadAt } from "../leaders/types";

/** An adjacent hire is news while its start is at most this many months ago (the longest timing window, lib/radar/predict.ts). */
export const HIRE_FRESH_MONTHS = 18;
/** An ended seat is news while its end is at most this many months ago. */
export const END_FRESH_MONTHS = 6;
/** A role the scan first saw is new while its posting is at most this old (when the board gives a date). */
const POSTED_WITHIN_MS = 14 * 24 * 60 * 60 * 1000;

/** The company facts a signal reads: free facts only (the name is for Pro, and only when the member can see it). */
export interface CompanyFacts {
  name: string;
  industry: string | null;
  employees: string | null;
  revenue: string | null;
  country: string | null;
  region: string | null;
  /** B2B, B2C or B2B2C, when on file (a rule reads it). */
  model?: string | null;
  /** The facts the ideal client's newer criteria read (sells to, customer size, model, motion, deal size, sales cycle), when on file. */
  fit?: import("../idealClient").FitFacts;
}

export interface RawSignal {
  /** Never the same key twice to a member: "role:<seat public id>", "hire:…", "end:…", "fund:<company public id>:<day>", "build:…:<day>", "gone:…:<function>:<day>". */
  key: string;
  kind: RadarKind;
  /** When Merlin saw it (the day it lists on): a seat added, a posting first seen, an end recorded. */
  at: string;
  atMs: number;
  /**
   * When the event itself happened (YYYY-MM-DD), where Merlin knows it and it differs from `at`: a
   * hire's start month (its first day), an ended seat's end month, a posting's own day. The page
   * dates the signal by this, so "New this week" means it happened this week, never that Merlin
   * noticed it this week (acceptance F5). Every kind sets it where the event has a date of its own (see
   * eventDay); a standing state with none is `ongoing` instead, never dated by today.
   */
  happened?: string;
  /** A state with no event date (a leadership gap a team page shows): the page says "Ongoing", never new, never at Now. */
  ongoing?: boolean;
  /** Internal ids: never sent. */
  companyId: string;
  engagementId: string | null;
  /** The function hired, the open role's, the ended seat's, the departed leader's. Null for funding and a sales build. */
  fn: string | null;
  /** An open role's title without the company's name or site in it. */
  title: string | null;
  /** Funding only. `fundNote`: the source and month a filing gives ("SEC filing, Oct 2026"). */
  round?: string | null;
  amount?: string | null;
  fundNote?: string | null;
  co: CompanyFacts;
  /** Functions the company has a fractional hire in (any time), for "no fractional in your function yet". A fractional or interim leader on its website (lib/leaders) counts. */
  hiredFns: string[];
  /** Functions a full-time leader on the company's website leads, with the year since when ("" when it doesn't say). Left out when none. */
  ledFullTime?: Record<string, string>;
  /** Crystal Ball's stage: the revenue band when the seat started (on file), else the company's band now. */
  stage?: string | null;
  /** Ownership on file (OWNERSHIP_TYPES), or read from a seat's "PE deal". Null: Unknown. */
  owner?: string | null;
  /** adjacent: the hire's start month. */
  ym?: string | null;
  /** The company's fractional leadership seats that started in the last HIRE_FRESH_MONTHS (an adjacent hire's own included). */
  recent?: { fn: string; ym: string }[];
  /** seat: why it ended, when the seat holder said. */
  endReason?: string | null;
  /** sales-build: the count of full-time sales hires before and now. */
  build?: { from: number; to: number };
  /** departure: who was on file (full-time, fractional; the level). Never a name. */
  gone?: { kind: string; level: string };
  /**
   * What we know about who leads each function there (lib/leaders/types.ts fnKnow): when a team
   * page there was last read (in the last KNOWN_DAYS, else null: we haven't checked), and each
   * function with a full-time leader on its website or one members say is in place. Left out: unknown.
   */
  lead?: SignalLeads;
  /** adjacent: when the seat came into Merlin (the original signal's time). */
  addedMs?: number;
  /**
   * adjacent, re-surfaced: the hire came in earlier (its first signal, `of`, read Low because its
   * timing window hadn't opened), and a window may open in (from, to]. Scored per member
   * (lib/radar/match.ts): kept only when that member's window opens then and it reads Medium or High.
   */
  reopen?: { from: number; to: number };
  of?: string;
  /** tenure: the seat's start month, how many months in it is, and the mark it reached (TENURE_MARKS). */
  tenure?: { start: string; months: number; mark: number };
  /** rehire: the ended seat's end as on file ("2025-06", or a year alone) and the whole months since its latest possible end. */
  ended?: { end: string; months: number };
  /** arrival: the new leader's level and kind on the team page, and since when when it says. Never a name. */
  arrived?: { kind: string; level: string; since?: string };
  /** team-build: full-time hires in the function the career feed listed, before and now. */
  team?: { from: number; to: number };
  /** headcount: the size band before and now. */
  size?: { from: string; to: string };
  /** Not an event: a state still true today (a window open, a gap still there), only for a day with few fresh events (match.ts pickDaily). */
  standing?: boolean;
  /** A standing state is not offered when any of these keys went to the member (its own event did). */
  sameAs?: string[];
  /** Internal member id of a member who holds the seat: never sent their own seat. Internal: never sent. */
  holderId?: string | null;
  /** Functions with an active fractional seat there now (not ended), or a fractional or interim leader on its website. */
  activeFns?: string[];
}

/** A signal read off the calendar (a window opening, a tenure mark, a gap since an ended seat) or a standing state: nothing new happened at the company. */
export const isCalendar = (x: Pick<RawSignal, "kind" | "reopen" | "standing">) => !!x.reopen || !!x.standing || x.kind === "tenure" || x.kind === "rehire";

/** RawSignal.lead. */
export interface SignalLeads {
  teamAt: string | null;
  ft: Record<string, { how: string; level: string; since?: string; role?: string; confirmed: boolean }>;
}

type G = ReturnType<typeof T.graph>;
type EngNode = G["engagements"] extends Map<string, infer V> ? V : never;
type Tracks = ReturnType<typeof T.tracksOf>;

const named = (fn: string | null | undefined) => (fn && fn !== "Other" ? fn : null);

/** A fractional hire on file, read from the state the way isHire reads a member's view. */
export function isHireRaw(e: EngNode, s: State, tracks: Tracks): boolean {
  if (T.isOpenRole(e, s, tracks)) return false;
  if (e.source === "Demand scan" && !T.live(e, s, "operator")) return false;
  // A fractional service a firm named (outsourced accounting, freelance marketers): not a hire.
  if (e.service) return false;
  const type = T.live(e, s, "type");
  return !type || FRACTIONAL_TYPES.includes(type);
}
/** A fractional leader's hire (isLeaderHire): a hire whose stored title doesn't read below Lead. */
export const isLeaderRaw = (e: EngNode, s: State, tracks: Tracks) => isHireRaw(e, s, tracks) && !T.belowLead(T.live(e, s, "role"));

export function companyFacts(g: G, s: State, companyId: string): CompanyFacts | null {
  const c = g.companies.get(companyId);
  if (!c) return null;
  const geo = T.geoOf(c, s);
  return {
    name: c.name,
    industry: T.live(c, s, "industry"),
    employees: T.live(c, s, "employees"),
    revenue: T.live(c, s, "revenue"),
    country: geo.country,
    region: geo.region,
    model: T.live(c, s, "businessModel"),
    fit: T.fitFactsOf(c, s),
  };
}

/** The companies on Merlin, as a funding provider is asked about them. */
export function fundingCompanies(seed: Seed, s: State): FundingCompany[] {
  const g = T.graph(seed, s);
  const firms = T.firmsInReview(seed, s);
  return [...g.companies.values()].filter((c) => !firms.has(c.id)).map((c) => ({ id: c.id, name: c.name, domain: siteKey(T.live(c, s, "website")) || null }));
}

/**
 * A company's ownership as Crystal Ball reads it: the company fact, else "PE-backed" when a seat
 * holder said a PE deal was why the seat came about. Nothing is guessed from a name. Null: Unknown.
 */
export function ownershipOf(s: State, companyId: string, seats: EngNode[]): string | null {
  const v = s.values[`${companyId}.ownership`];
  if (v?.status === "live" && v.value) return v.value;
  if (seats.some((e) => (T.live(e, s, "whyNow") ?? "").split(", ").includes("PE deal"))) return "PE-backed";
  return null;
}

/** A seat's stage: the revenue band when it started (the seat's own "Revenue at the time"), else the company's band now. */
export function stageOf(s: State, e: EngNode | null, companyRevenue: string | null): string | null {
  const then = e ? T.live(e, s, "revenue") : null;
  return isStage(then) ? then : isStage(companyRevenue) ? companyRevenue : null;
}

/**
 * Every fractional or interim leadership seat with a start month, for counting transitions
 * (lib/radar/predict.ts countTransitions). Firms in review are left out. Counts only leave here.
 */
export function seatPoints(seed: Seed, s: State): SeatPoint[] {
  const g = T.graph(seed, s);
  const tracks = T.tracksOf(seed, s);
  const firms = T.firmsInReview(seed, s);
  const out: SeatPoint[] = [];
  for (const e of g.engagements.values()) {
    if (firms.has(e.companyId) || !isLeaderRaw(e, s, tracks)) continue;
    const fn = named(T.fnOf(e, s));
    const start = T.live(e, s, "start");
    if (!fn || !start || !/^\d{4}(-\d{2})?$/.test(start)) continue;
    const c = g.companies.get(e.companyId);
    out.push({ companyId: e.companyId, fn, ym: start, stage: stageOf(s, e, c ? T.live(c, s, "revenue") : null) as SeatPoint["stage"] });
  }
  return out;
}

const countsMemo = new WeakMap<State, TransitionCounts>();
/** Merlin's observed transitions (A -> B by stage), for the Beta update. Kept per state. */
export function observedTransitions(seed: Seed, s: State): TransitionCounts {
  let c = countsMemo.get(s);
  if (!c) countsMemo.set(s, (c = countTransitions(seatPoints(seed, s))));
  return c;
}

const monthOfMs = (ms: number) => {
  const d = new Date(ms);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};

/** The seat is over: its status says Ended (or Closed), or its end is a month or year already past. */
function seatEnded(e: EngNode, s: State, nowMs: number): boolean {
  const status = T.live(e, s, "status");
  if (status === "Ended" || status === "Closed") return true;
  if (status === "Active") return false;
  const end = monthSpan(T.live(e, s, "end"));
  return !!end && end.to < monthOfMs(nowMs);
}

/** The shared reading of the table a run's signals (and standing states) are made from. */
function readTable(seed: Seed, s: State, nowMs: number) {
  const g = T.graph(seed, s);
  const tracks = T.tracksOf(seed, s);
  const firms = T.firmsInReview(seed, s);
  const idx = T.memberIndex(seed, s);

  // Each company's seats, and the functions it has a hire in.
  const byCompany = new Map<string, EngNode[]>();
  for (const e of g.engagements.values()) {
    const l = byCompany.get(e.companyId) ?? [];
    l.push(e);
    byCompany.set(e.companyId, l);
  }
  const leadsKind = (companyId: string) =>
    Object.entries(s.leaders?.[companyId]?.functions ?? {})
      .filter(([, l]) => l.kind === "fractional" || l.kind === "interim")
      .map(([fn]) => fn);
  const hiredFnsMemo = new Map<string, string[]>();
  const hiredFns = (companyId: string) => {
    let h = hiredFnsMemo.get(companyId);
    if (!h) {
      h = [...new Set([...(byCompany.get(companyId) ?? []).filter((e) => isHireRaw(e, s, tracks)).map((e) => named(T.fnOf(e, s))), ...leadsKind(companyId)].filter((x): x is string => !!x))];
      hiredFnsMemo.set(companyId, h);
    }
    return h;
  };
  const activeMemo = new Map<string, string[]>();
  const activeFns = (companyId: string) => {
    let h = activeMemo.get(companyId);
    if (!h) {
      h = [
        ...new Set(
          [...(byCompany.get(companyId) ?? []).filter((e) => isHireRaw(e, s, tracks) && !seatEnded(e, s, nowMs)).map((e) => named(T.fnOf(e, s))), ...leadsKind(companyId)].filter((x): x is string => !!x),
        ),
      ];
      activeMemo.set(companyId, h);
    }
    return h;
  };
  // The company's fractional leadership seats of the last HIRE_FRESH_MONTHS, oldest first.
  const recentOf = (companyId: string) =>
    (byCompany.get(companyId) ?? [])
      .filter((e) => isLeaderRaw(e, s, tracks))
      .flatMap((e) => {
        const fn = named(T.fnOf(e, s));
        const ym = hireMonth(T.live(e, s, "start"));
        return fn && ym && monthsAgo(ym, nowMs) <= HIRE_FRESH_MONTHS && monthsAgo(ym, nowMs) >= 0 ? [{ fn, ym }] : [];
      })
      .sort((a, b) => a.ym.localeCompare(b.ym));
  const leadsMemo = new Map<string, SignalLeads>();
  const leadsOf = (companyId: string): SignalLeads => {
    let l = leadsMemo.get(companyId);
    if (!l) {
      const rec = s.leaders?.[companyId] ?? null;
      const said = s.leaderReports?.[companyId] ?? {};
      const ft: SignalLeads["ft"] = {};
      for (const fn of new Set([...Object.keys(rec?.functions ?? {}), ...Object.keys(said)])) {
        const k = fnKnow(rec, said[fn], fn, nowMs);
        if (k.s === "full-time") ft[fn] = { how: k.how, level: k.level, ...(k.since ? { since: k.since } : {}), ...(k.role ? { role: k.role } : {}), confirmed: k.confirmed };
      }
      leadsMemo.set(companyId, (l = { teamAt: teamReadAt(rec, nowMs), ft }));
    }
    return l;
  };
  const holderOf = (e: EngNode | null) => (e ? T.seatHolder(s, idx, e.id, T.valueOf(e, s, "operator"))?.id ?? null : null);
  const out: RawSignal[] = [];
  const push = (x: Omit<RawSignal, "co" | "hiredFns" | "atMs"> & { atMs?: number }) => {
    if (firms.has(x.companyId)) return;
    const co = companyFacts(g, s, x.companyId);
    if (!co) return;
    const ft = Object.entries(s.leaders?.[x.companyId]?.functions ?? {}).filter(([, l]) => l.kind === "full-time");
    const e = x.engagementId ? g.engagements.get(x.engagementId) ?? null : null;
    const holderId = holderOf(e);
    out.push({
      ...x,
      atMs: x.atMs ?? Date.parse(x.at),
      co,
      hiredFns: hiredFns(x.companyId),
      activeFns: activeFns(x.companyId),
      ...(holderId ? { holderId } : {}),
      ...(ft.length ? { ledFullTime: Object.fromEntries(ft.map(([fn, l]) => [fn, l.since?.slice(0, 4) ?? ""])) } : {}),
      lead: leadsOf(x.companyId),
      stage: stageOf(s, e, co.revenue),
      owner: ownershipOf(s, x.companyId, byCompany.get(x.companyId) ?? []),
      recent: recentOf(x.companyId),
    });
  };
  // When each seat came into Merlin: its own time, else the seed's build for a seat that came with the seed.
  const added = seatAddedTimes(seed, s);
  const seedIds = new Set(seed.engagements.map((e) => e.id));
  const builtMs = Date.parse(seed.builtAt ?? "");
  const addedOf = (e: EngNode): number | undefined => added.get(T.pubId(e.id)) ?? (seedIds.has(e.id) && Number.isFinite(builtMs) ? builtMs : undefined);
  return { g, tracks, firms, out, push, addedOf, hiredFns, activeFns, leadsOf };
}
type TableRead = ReturnType<typeof readTable>;

/** A fractional seat (Fractional, or no type on file) still going, with a start month: what a tenure mark reads. Interim, advisory and project seats end by design. */
function tenureSeat(e: EngNode, s: State, tracks: Tracks, nowMs: number): { fn: string; start: string; m: number } | null {
  if (!isLeaderRaw(e, s, tracks) || seatEnded(e, s, nowMs)) return null;
  const type = T.live(e, s, "type");
  if (type && type !== "Fractional") return null;
  const fn = named(T.fnOf(e, s));
  const start = T.live(e, s, "start");
  const m = start && /^\d{4}-\d{2}$/.test(start) ? monthIndex(start) : null;
  return fn && start && m !== null ? { fn, start, m } : null;
}

/** An ended fractional leadership seat with an end on file, read defensively (a year alone spans the year): what a rehire reads. */
function endedSeat(e: EngNode, s: State, tracks: Tracks, nowMs: number): { fn: string; end: string; span: { from: number; to: number } } | null {
  if (!isLeaderRaw(e, s, tracks) || !seatEnded(e, s, nowMs)) return null;
  const fn = named(T.fnOf(e, s));
  const end = T.live(e, s, "end");
  const span = monthSpan(end);
  return fn && end && span ? { fn, end, span } : null;
}

/** A leadership gap at a company, by function, from its own team page: none when the page wasn't read lately (KNOWN_DAYS). */
function gapsAt(r: TableRead, s: State, companyId: string, nowMs: number): { fn: string; stage: string; at: string; key: string }[] {
  const rec = s.leaders?.[companyId];
  const teamAt = teamReadAt(rec ?? null, nowMs);
  if (!rec || !teamAt || rec.ok === false) return [];
  const c = r.g.companies.get(companyId);
  if (!c) return [];
  const stage = T.live(c, s, "revenue");
  const band = T.live(c, s, "employees");
  if (!isStage(stage) || !GAP_STAGES.includes(stage) || !band || SIZE_BANDS.indexOf(band) < SIZE_BANDS.indexOf(GAP_MIN_BAND)) return [];
  const lead = r.leadsOf(companyId);
  const hired = r.hiredFns(companyId);
  // Dated by when this reading of the page was first seen, not by the latest re-read: reading every team page again
  // (a new reader, the 75-day refresh) must not move every old gap into Today and the last 7 days.
  const at = rec.hashAt && rec.hashAt < teamAt ? rec.hashAt : teamAt;
  return GAP_FUNCTIONS.filter((fn) => !rec.functions[fn] && !lead.ft[fn] && !hired.includes(fn) && propensity(fn, stage) >= GAP_MIN_SHARE).map((fn) => ({
    fn,
    stage,
    at,
    // The same reading of the page is the same gap: a new key only when what the page lists changed.
    key: `gap:${T.pubId(companyId)}:${fn}:${(rec.hash ?? "none").slice(0, 10)}`,
  }));
}

/**
 * Every signal that happened after `sinceMs` and by `nowMs`. `funding` are the events the funding
 * source returned for the same window. Newest first.
 */
/** A month ("2026-10") as its first day, never after today. */
const monthDay = (ym: string, nowMs: number) => {
  const d = `${ym}-01`;
  const today = new Date(nowMs).toISOString().slice(0, 10);
  return d > today ? today : d;
};

/** A month index (year * 12 + month - 1) as its first day, never after today. */
const monthIdxDay = (m: number, nowMs: number) => monthDay(`${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}`, nowMs);
/** "2026-09" (or "2026-09-14") as the month's first day; a year alone, or nothing, is no date. */
const sinceDay = (since: string | null | undefined, nowMs: number) => (since && /^\d{4}-\d{2}/.test(since) ? monthDay(since.slice(0, 7), nowMs) : undefined);
/** When a leader of this function was last seen gone from the company's website, by nowMs (the day a gap there began, as far as Merlin knows). */
const leftDay = (s: State, companyId: string, fn: string, nowMs: number) =>
  (s.leaderDepartures ?? [])
    .filter((x) => x.companyId === companyId && x.fn === fn && Date.parse(x.at) <= nowMs)
    .map((x) => x.at.slice(0, 10))
    .sort()
    .pop();
/** A gap's date: the day its leader left, where Merlin saw one leave; else none (a state: "Ongoing"). */
const gapDate = (s: State, companyId: string, fn: string, nowMs: number): Pick<RawSignal, "happened" | "ongoing"> => {
  const d = leftDay(s, companyId, fn, nowMs);
  return d ? { happened: d } : { ongoing: true };
};

export function detectSignals(seed: Seed, s: State, sinceMs: number, nowMs: number, funding: FundingEvent[] = []): RawSignal[] {
  const r = readTable(seed, s, nowMs);
  const { g, tracks, push, out, addedOf } = r;
  const inWindow = (ms: number) => Number.isFinite(ms) && ms > sinceMs && ms <= nowMs;

  // 1. Adjacent hires: leadership seats that came into the table in the window.
  const added = seatAddedTimes(seed, s);
  for (const e of g.engagements.values()) {
    const at = added.get(T.pubId(e.id));
    if (at === undefined || !inWindow(at)) continue;
    const fn = named(T.fnOf(e, s));
    if (!fn || !isLeaderRaw(e, s, tracks)) continue;
    const ym = hireMonth(T.live(e, s, "start"));
    if (!ym || monthsAgo(ym, nowMs) > HIRE_FRESH_MONTHS) continue;
    push({ key: `hire:${T.pubId(e.id)}`, kind: "adjacent", at: new Date(at).toISOString(), atMs: at, happened: monthDay(ym, nowMs), companyId: e.companyId, engagementId: e.id, fn, title: null, ym, addedMs: at });
  }

  // 1b. Adjacent hires that came in earlier (a seat that came with the seed came in when it was built), whose timing
  // window may open in this window: each once more (key "…:open"), on a day of the month spread by the seat
  // (predict.ts windowOpensMs), scored per member (lib/radar/match.ts keeps it only when their window opens now and
  // it reads Medium or High).
  for (const e of g.engagements.values()) {
    const at = addedOf(e);
    if (at === undefined || !Number.isFinite(at) || at > sinceMs) continue;
    const ym = hireMonth(T.live(e, s, "start"));
    if (!ym || monthsAgo(ym, nowMs) > HIRE_FRESH_MONTHS || monthsAgo(ym, nowMs) < 0) continue;
    const opens = GAP_STARTS.map((a) => windowOpensMs(ym, a, e.id)).filter((ms) => inWindow(ms) && ms > at);
    if (!opens.length) continue;
    const fn = named(T.fnOf(e, s));
    if (!fn || !isLeaderRaw(e, s, tracks)) continue;
    const key = `hire:${T.pubId(e.id)}`;
    const first = Math.min(...opens);
    push({ key: `${key}:open`, of: key, kind: "adjacent", at: new Date(first).toISOString(), atMs: first, happened: monthDay(ym, nowMs), companyId: e.companyId, engagementId: e.id, fn, title: null, ym, addedMs: at, reopen: { from: sinceMs, to: nowMs } });
  }

  // 2. Open roles the scan first saw in the window.
  for (const t of tracks.values()) {
    const at = Date.parse(t.firstSeen);
    if (t.closedAt || !inWindow(at) || T.isUnseen(t)) continue;
    const posted = Date.parse(t.postedAt ?? "");
    if (Number.isFinite(posted) && nowMs - posted > POSTED_WITHIN_MS) continue;
    const e = g.engagements.get(t.engagementId);
    if (!e || !T.isOpenRole(e, s, tracks) || T.offBarRole(e, s, tracks, true)) continue;
    const fn = named(T.fnOf(e, s));
    if (!fn) continue;
    const c = g.companies.get(e.companyId);
    const fallback = `Fractional ${fn} role`;
    const raw = T.live(e, s, "role");
    let title = raw ? titleWithout(raw, c?.name ?? "", T.live(c, s, "website") ?? null, fallback).trim() : fallback;
    if (!title || title.length > 90 || /https?:|www\.|@/i.test(title)) title = fallback;
    // Dated by the posting's own day; a board that gives none: the day the scan first saw it, the earliest Merlin knows.
    push({ key: `role:${T.pubId(e.id)}`, kind: "role", at: t.firstSeen, happened: (Number.isFinite(posted) && posted <= nowMs ? new Date(posted).toISOString() : t.firstSeen).slice(0, 10), companyId: e.companyId, engagementId: e.id, fn, title });
  }

  // 3. Seats that just ended: the end (or the status Ended) was recorded in the window.
  for (const e of g.engagements.values()) {
    const end = s.values[`${e.id}.end`];
    const status = s.values[`${e.id}.status`];
    const endAt = end && end.status === "live" && hireMonth(end.value) ? Date.parse(end.at) : NaN;
    const statusAt = status && status.status === "live" && status.value === "Ended" ? Date.parse(status.at) : NaN;
    const at = inWindow(endAt) ? endAt : inWindow(statusAt) ? statusAt : NaN;
    if (!Number.isFinite(at)) continue;
    if (T.live(e, s, "status") === "Active" || T.live(e, s, "end") === "Ongoing") continue;
    const ym = hireMonth(T.live(e, s, "end"));
    // Ended with no month on file: the status change is the news. With a month, it ended lately.
    if (ym && monthsAgo(ym, nowMs) > END_FRESH_MONTHS) continue;
    const fn = named(T.fnOf(e, s));
    if (!fn || !isLeaderRaw(e, s, tracks)) continue;
    push({ key: `end:${T.pubId(e.id)}`, kind: "seat", at: new Date(at).toISOString(), atMs: at, ...(ym ? { happened: monthDay(ym, nowMs) } : {}), companyId: e.companyId, engagementId: e.id, fn, title: null, endReason: T.live(e, s, "endReason") });
  }

  // 4. Funding, from the source (SEC filings with RN_FUNDING=1, else nothing).
  for (const f of funding) {
    const at = Date.parse(f.at);
    if (!inWindow(at) || !g.companies.has(f.companyId)) continue;
    push({ key: `fund:${T.pubId(f.companyId)}:${f.at.slice(0, 10)}`, kind: "funding", at: new Date(at).toISOString(), atMs: at, happened: f.at.slice(0, 10), companyId: f.companyId, engagementId: null, fn: null, title: null, round: f.round, amount: f.amount, ...(f.note ? { fundNote: f.note } : {}) });
  }

  // 5. First sales hires posted, or a jump in them (the career feeds' counts).
  for (const [companyId, rec] of Object.entries(s.salesBuild ?? {})) {
    if (!g.companies.has(companyId)) continue;
    for (const x of rec.rises ?? []) {
      const at = Date.parse(x.at);
      if (!inWindow(at)) continue;
      push({ key: `build:${T.pubId(companyId)}:${x.at.slice(0, 10)}`, kind: "sales-build", at: new Date(at).toISOString(), atMs: at, happened: x.at.slice(0, 10), companyId, engagementId: null, fn: null, title: null, build: { from: x.from, to: x.to } });
    }
  }

  // 6. A leader gone from the company's own website.
  for (const x of s.leaderDepartures ?? []) {
    const at = Date.parse(x.at);
    if (!inWindow(at) || !g.companies.has(x.companyId)) continue;
    push({ key: `gone:${T.pubId(x.companyId)}:${x.fn}:${x.at.slice(0, 10)}`, kind: "departure", at: new Date(at).toISOString(), atMs: at, happened: x.at.slice(0, 10), companyId: x.companyId, engagementId: null, fn: x.fn, title: null, gone: { kind: x.kind, level: x.level } });
  }

  // 7. Tenure: an active fractional seat reached the months seats like it usually last (predict.ts TENURE_MARKS), on a
  // day of that month spread by the seat. Only when the seat was on file by then: else it is a standing state.
  for (const e of g.engagements.values()) {
    const t = tenureSeat(e, s, tracks, nowMs);
    if (!t) continue;
    const at = addedOf(e);
    if (at === undefined) continue;
    for (const mark of TENURE_MARKS) {
      const ms = dayInMonthMs(t.m + mark, `${e.id}:tenure`);
      if (!inWindow(ms) || ms <= at) continue;
      push({ key: `tenure:${T.pubId(e.id)}:${mark}`, kind: "tenure", at: new Date(ms).toISOString(), atMs: ms, happened: monthIdxDay(t.m + mark, nowMs), companyId: e.companyId, engagementId: e.id, fn: t.fn, title: null, tenure: { start: t.start, months: mark, mark } });
    }
  }

  // 8. Rehire: a fractional seat that ended REHIRE_MONTHS[0] months ago (counted from its latest possible end, a
  // year alone read as its December), while still inside REHIRE_MONTHS[1] of its earliest. On a day spread by the seat.
  for (const e of g.engagements.values()) {
    const x = endedSeat(e, s, tracks, nowMs);
    if (!x) continue;
    const at = addedOf(e);
    if (at === undefined) continue;
    const ms = dayInMonthMs(x.span.to + REHIRE_MONTHS[0], `${e.id}:rehire`);
    if (!inWindow(ms) || ms <= at || monthOfMs(nowMs) > x.span.from + REHIRE_MONTHS[1]) continue;
    push({ key: `rehire:${T.pubId(e.id)}`, kind: "rehire", at: new Date(ms).toISOString(), atMs: ms, happened: monthIdxDay(x.span.to, nowMs), companyId: e.companyId, engagementId: e.id, fn: x.fn, title: null, endReason: T.live(e, s, "endReason"), ended: { end: x.end, months: REHIRE_MONTHS[0] } });
  }

  // 9. A new leader on the company's own website, read OK both times (State.leaderArrivals, lib/table.ts saveLeaders).
  for (const x of s.leaderArrivals ?? []) {
    const at = Date.parse(x.at);
    if (!inWindow(at) || !g.companies.has(x.companyId)) continue;
    push({ key: `arrive:${T.pubId(x.companyId)}:${x.fn}:${x.at.slice(0, 10)}`, kind: "arrival", at: new Date(at).toISOString(), atMs: at, happened: sinceDay(x.since, nowMs) ?? x.at.slice(0, 10), companyId: x.companyId, engagementId: null, fn: x.fn, title: null, arrived: { kind: x.kind, level: x.level, ...(x.since ? { since: x.since } : {}) } });
  }

  // 10. A burst of full-time hires in a function besides sales (the career feeds' counts, State.teamBuild).
  for (const [companyId, byFn] of Object.entries(s.teamBuild ?? {})) {
    if (!g.companies.has(companyId)) continue;
    for (const [fn, rec] of Object.entries(byFn))
      for (const x of rec.rises ?? []) {
        const at = Date.parse(x.at);
        if (!inWindow(at)) continue;
        push({ key: `team:${T.pubId(companyId)}:${fn}:${x.at.slice(0, 10)}`, kind: "team-build", at: new Date(at).toISOString(), atMs: at, happened: x.at.slice(0, 10), companyId, engagementId: null, fn, title: null, team: { from: x.from, to: x.to } });
      }
  }

  // 11. The size band rose to one the research ties a seat to (State.headcount, recordHeadcount).
  for (const [companyId, h] of Object.entries(s.headcount ?? {})) {
    if (!g.companies.has(companyId)) continue;
    for (let i = 1; i < h.length; i++) {
      const at = Date.parse(h[i].at);
      const [from, to] = [h[i - 1].band, h[i].band];
      if (!inWindow(at) || !HEADCOUNT_PRIORS[to] || SIZE_BANDS.indexOf(from) < 0 || SIZE_BANDS.indexOf(to) <= SIZE_BANDS.indexOf(from)) continue;
      push({ key: `size:${T.pubId(companyId)}:${to}:${h[i].at.slice(0, 10)}`, kind: "headcount", at: new Date(at).toISOString(), atMs: at, happened: h[i].at.slice(0, 10), companyId, engagementId: null, fn: null, title: null, size: { from, to } });
    }
  }

  // 12. A leadership gap confirmed by a team page read in the window (the same reading of the page: the same key).
  for (const companyId of Object.keys(s.leaders ?? {})) {
    for (const x of gapsAt(r, s, companyId, nowMs)) {
      const at = Date.parse(x.at);
      if (!inWindow(at)) continue;
      // A gap is a state: dated by the day its leader left where Merlin saw that, else "Ongoing" (never the day the page was read).
      push({ key: x.key, kind: "gap", at: new Date(at).toISOString(), atMs: at, ...gapDate(s, companyId, x.fn, nowMs), companyId, engagementId: null, fn: x.fn, title: null });
    }
  }

  return out.sort((a, b) => b.atMs - a.atMs);
}

/**
 * The states still true today, for a member's day when fewer than two fresh events reach them
 * (lib/radar/match.ts pickDaily), each keyed "still:…" and offered only while none of its events
 * (sameAs) went to the member:
 *   adjacent  a leadership hire (on file, started in the last HIRE_FRESH_MONTHS) whose timing window is
 *             open for the member's function now (match.ts checks the window, per member)
 *   tenure    an active fractional seat 12 to 24 months in (past the median of ended seats)
 *   rehire    a fractional seat that ended REHIRE_MONTHS ago
 *   gap       a leadership gap its team page still shows (read in the last KNOWN_DAYS)
 * Each lists on today (nothing happened today, and the card says so: "Still a good time: …"), but is dated by
 * its own event (`happened`: the hire's start, the tenure mark's month, the seat's end), or is `ongoing` (a
 * gap): never "new this week" for being true today.
 */
export function standingSignals(seed: Seed, s: State, nowMs: number): RawSignal[] {
  const r = readTable(seed, s, nowMs);
  const { g, tracks, push, out, addedOf } = r;
  const at = new Date(nowMs).toISOString();
  const nowM = monthOfMs(nowMs);
  for (const e of g.engagements.values()) {
    const on = addedOf(e);
    if (on === undefined || on > nowMs) continue;
    const pub = T.pubId(e.id);
    const fn = named(T.fnOf(e, s));
    if (!fn || !isLeaderRaw(e, s, tracks)) continue;
    const ym = hireMonth(T.live(e, s, "start"));
    if (ym && monthsAgo(ym, nowMs) >= 1 && monthsAgo(ym, nowMs) <= HIRE_FRESH_MONTHS)
      push({ key: `still:hire:${pub}`, of: `hire:${pub}`, sameAs: [`hire:${pub}`, `hire:${pub}:open`], standing: true, kind: "adjacent", at, atMs: nowMs, happened: monthDay(ym, nowMs), companyId: e.companyId, engagementId: e.id, fn, title: null, ym, addedMs: on });
    const t = tenureSeat(e, s, tracks, nowMs);
    const months = t ? nowM - t.m : -1;
    if (t && months >= TENURE_MARKS[0] && months <= TENURE_UNTIL) {
      const mark = [...TENURE_MARKS].reverse().find((m) => months >= m)!;
      push({ key: `still:tenure:${pub}`, sameAs: TENURE_MARKS.map((m) => `tenure:${pub}:${m}`), standing: true, kind: "tenure", at, atMs: nowMs, happened: monthIdxDay(t.m + mark, nowMs), companyId: e.companyId, engagementId: e.id, fn: t.fn, title: null, tenure: { start: t.start, months, mark } });
    }
    const x = endedSeat(e, s, tracks, nowMs);
    if (x && nowM >= x.span.to + REHIRE_MONTHS[0] && nowM <= x.span.from + REHIRE_MONTHS[1])
      push({ key: `still:rehire:${pub}`, sameAs: [`rehire:${pub}`], standing: true, kind: "rehire", at, atMs: nowMs, happened: monthIdxDay(x.span.to, nowMs), companyId: e.companyId, engagementId: e.id, fn: x.fn, title: null, endReason: T.live(e, s, "endReason"), ended: { end: x.end, months: nowM - x.span.to } });
  }
  for (const companyId of Object.keys(s.leaders ?? {}))
    for (const x of gapsAt(r, s, companyId, nowMs)) push({ key: `still:${x.key}`, sameAs: [x.key], standing: true, kind: "gap", at, atMs: nowMs, ...gapDate(s, companyId, x.fn, nowMs), companyId, engagementId: null, fn: x.fn, title: null });
  return out;
}

/**
 * Note each company's employee band when it changed (State.headcount, oldest first), so a company
 * crossing 25 or 50 people can be read later. Our records' band is the start and stays implicit:
 * a company is noted only once its band differs from it, and then with that band first (dated when
 * the records were built). Called once a day by the radar's run.
 */
export function recordHeadcount(d: State, seed: Seed, nowIso: string): number {
  const g = T.graph(seed, d);
  const all = (d.headcount ??= {});
  let n = 0;
  for (const c of g.companies.values()) {
    const band = T.live(c, d, "employees");
    if (!band) continue;
    const was = (c as { seedFields?: Record<string, string | undefined> }).seedFields?.employees ?? null;
    if (!all[c.id]) {
      if (band === was) continue;
      all[c.id] = was ? [{ band: was, at: seed.builtAt ?? nowIso }] : [];
    }
    const h = all[c.id];
    if (h[h.length - 1]?.band === band) continue;
    h.push({ band, at: nowIso });
    if (h.length > 12) h.splice(0, h.length - 12);
    n++;
  }
  return n;
}

/**
 * When the event behind a signal key happened, read from the table as it is now: what the day's view puts on a
 * row kept with a delivery (State.radar.members[id].days), so a row kept before every kind was dated by its event
 * (or one a standing state dated by its delivery day) never reads as new this week for being sent this week.
 *   hire, still:hire           the seat's start month          end      the seat's end month
 *   rehire, still:rehire       the seat's end month            tenure   the month the mark was reached
 *   role                       the posting's own day           arrive   the leader's "since" month on the page
 *   gap, still:gap             the day its leader left where Merlin saw it, else ongoing (no event date)
 * Null: nothing better than what the row says (a funding filing, a build, a departure, a size change carry their
 * own day in the key and on the row; an unknown key keeps its row's date).
 */
export function signalDates(seed: Seed, s: State, nowMs: number): (key: string) => { a?: string; o?: 1 } | null {
  const g = T.graph(seed, s);
  const tracks = T.tracksOf(seed, s);
  const seats = new Map<string, EngNode>();
  for (const e of g.engagements.values()) seats.set(T.pubId(e.id), e);
  const cos = new Map<string, string>();
  for (const c of g.companies.values()) cos.set(T.pubId(c.id), c.id);
  const posted = new Map<string, string>();
  for (const t of tracks.values()) if (t.postedAt && Date.parse(t.postedAt) <= nowMs) posted.set(t.engagementId, t.postedAt.slice(0, 10));
  const nowM = monthOfMs(nowMs);
  const ymDay = (v: string | null | undefined) => {
    const ym = hireMonth(v);
    return ym ? monthDay(ym, nowMs) : null;
  };
  return (key) => {
    const p = (key.startsWith("still:") ? key.slice(6) : key).split(":");
    const e = seats.get(p[1] ?? "");
    switch (p[0]) {
      case "hire": {
        const d = e ? ymDay(T.live(e, s, "start")) : null;
        return d ? { a: d } : null;
      }
      case "end":
      case "rehire": {
        const span = e ? monthSpan(T.live(e, s, "end")) : null;
        return span ? { a: monthIdxDay(span.to, nowMs) } : null;
      }
      case "tenure": {
        const t = e ? tenureSeat(e, s, tracks, nowMs) : null;
        if (!t) return null;
        const mark = Number(p[2]) || [...TENURE_MARKS].reverse().find((m) => nowM - t.m >= m);
        return mark ? { a: monthIdxDay(t.m + mark, nowMs) } : null;
      }
      case "role": {
        const d = e ? posted.get(e.id) : undefined;
        return d ? { a: d } : null;
      }
      case "arrive": {
        const co = cos.get(p[1] ?? "");
        const x = co ? (s.leaderArrivals ?? []).find((y) => y.companyId === co && y.fn === p[2] && y.at.slice(0, 10) === p[3]) : undefined;
        const d = sinceDay(x?.since, nowMs);
        return d ? { a: d } : null;
      }
      case "gap": {
        const co = cos.get(p[1] ?? "");
        if (!co || !p[2]) return { o: 1 };
        const d = leftDay(s, co, p[2], nowMs);
        return d ? { a: d } : { o: 1 };
      }
      default:
        return null;
    }
  };
}

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
 *   funding     an event from lib/radar/sources/funding.ts (none until a provider is added).
 *   sales-build the company's career feed went from no full-time sales hires (AE, SDR, BDR) to some,
 *               or rose by two or more in 30 days (State.salesBuild, lib/table.ts noteSalesHires).
 *   departure   a leader the company's own website listed for a function is gone from it, read OK
 *               both times (State.leaderDepartures, lib/table.ts saveLeaders).
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
import { GAP_STARTS, countTransitions, isStage, windowOpensMs, type SeatPoint, type TransitionCounts } from "./predict";
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
}

export interface RawSignal {
  /** Never the same key twice to a member: "role:<seat public id>", "hire:…", "end:…", "fund:<company public id>:<day>", "build:…:<day>", "gone:…:<function>:<day>". */
  key: string;
  kind: RadarKind;
  at: string;
  atMs: number;
  /** Internal ids: never sent. */
  companyId: string;
  engagementId: string | null;
  /** The function hired, the open role's, the ended seat's, the departed leader's. Null for funding and a sales build. */
  fn: string | null;
  /** An open role's title without the company's name or site in it. */
  title: string | null;
  /** Funding only. */
  round?: string | null;
  amount?: string | null;
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
}

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

/**
 * Every signal that happened after `sinceMs` and by `nowMs`. `funding` are the events the funding
 * source returned for the same window. Newest first.
 */
export function detectSignals(seed: Seed, s: State, sinceMs: number, nowMs: number, funding: FundingEvent[] = []): RawSignal[] {
  const g = T.graph(seed, s);
  const tracks = T.tracksOf(seed, s);
  const firms = T.firmsInReview(seed, s);
  const inWindow = (ms: number) => Number.isFinite(ms) && ms > sinceMs && ms <= nowMs;

  // Each company's seats, and the functions it has a hire in.
  const byCompany = new Map<string, EngNode[]>();
  for (const e of g.engagements.values()) {
    const l = byCompany.get(e.companyId) ?? [];
    l.push(e);
    byCompany.set(e.companyId, l);
  }
  const hiredFnsMemo = new Map<string, string[]>();
  const hiredFns = (companyId: string) => {
    let h = hiredFnsMemo.get(companyId);
    if (!h) {
      const leads = Object.entries(s.leaders?.[companyId]?.functions ?? {})
        .filter(([, l]) => l.kind === "fractional" || l.kind === "interim")
        .map(([fn]) => fn);
      h = [...new Set([...(byCompany.get(companyId) ?? []).filter((e) => isHireRaw(e, s, tracks)).map((e) => named(T.fnOf(e, s))), ...leads].filter((x): x is string => !!x))];
      hiredFnsMemo.set(companyId, h);
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
  const out: RawSignal[] = [];
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
  const push = (x: Omit<RawSignal, "co" | "hiredFns" | "atMs"> & { atMs?: number }) => {
    if (firms.has(x.companyId)) return;
    const co = companyFacts(g, s, x.companyId);
    if (!co) return;
    const ft = Object.entries(s.leaders?.[x.companyId]?.functions ?? {}).filter(([, l]) => l.kind === "full-time");
    const e = x.engagementId ? g.engagements.get(x.engagementId) ?? null : null;
    out.push({
      ...x,
      atMs: x.atMs ?? Date.parse(x.at),
      co,
      hiredFns: hiredFns(x.companyId),
      ...(ft.length ? { ledFullTime: Object.fromEntries(ft.map(([fn, l]) => [fn, l.since?.slice(0, 4) ?? ""])) } : {}),
      lead: leadsOf(x.companyId),
      stage: stageOf(s, e, co.revenue),
      owner: ownershipOf(s, x.companyId, byCompany.get(x.companyId) ?? []),
      recent: recentOf(x.companyId),
    });
  };

  // 1. Adjacent hires: leadership seats that came into the table in the window.
  const added = seatAddedTimes(seed, s);
  for (const e of g.engagements.values()) {
    const at = added.get(T.pubId(e.id));
    if (at === undefined || !inWindow(at)) continue;
    const fn = named(T.fnOf(e, s));
    if (!fn || !isLeaderRaw(e, s, tracks)) continue;
    const ym = hireMonth(T.live(e, s, "start"));
    if (!ym || monthsAgo(ym, nowMs) > HIRE_FRESH_MONTHS) continue;
    push({ key: `hire:${T.pubId(e.id)}`, kind: "adjacent", at: new Date(at).toISOString(), atMs: at, companyId: e.companyId, engagementId: e.id, fn, title: null, ym, addedMs: at });
  }

  // 1b. Adjacent hires that came in earlier, whose timing window may open in this window: each once more (key "…:open"),
  // scored per member (lib/radar/match.ts keeps it only when their window opens now and it reads Medium or High).
  for (const e of g.engagements.values()) {
    const at = added.get(T.pubId(e.id));
    if (at === undefined || !Number.isFinite(at) || at > sinceMs) continue;
    const ym = hireMonth(T.live(e, s, "start"));
    if (!ym || monthsAgo(ym, nowMs) > HIRE_FRESH_MONTHS || monthsAgo(ym, nowMs) < 0) continue;
    const opens = GAP_STARTS.map((a) => windowOpensMs(ym, a)).filter((ms) => inWindow(ms) && ms > at);
    if (!opens.length) continue;
    const fn = named(T.fnOf(e, s));
    if (!fn || !isLeaderRaw(e, s, tracks)) continue;
    const key = `hire:${T.pubId(e.id)}`;
    const first = Math.min(...opens);
    push({ key: `${key}:open`, of: key, kind: "adjacent", at: new Date(first).toISOString(), atMs: first, companyId: e.companyId, engagementId: e.id, fn, title: null, ym, addedMs: at, reopen: { from: sinceMs, to: nowMs } });
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
    push({ key: `role:${T.pubId(e.id)}`, kind: "role", at: t.firstSeen, companyId: e.companyId, engagementId: e.id, fn, title });
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
    push({ key: `end:${T.pubId(e.id)}`, kind: "seat", at: new Date(at).toISOString(), atMs: at, companyId: e.companyId, engagementId: e.id, fn, title: null, endReason: T.live(e, s, "endReason") });
  }

  // 4. Funding, from the source (nothing until a provider is added).
  for (const f of funding) {
    const at = Date.parse(f.at);
    if (!inWindow(at) || !g.companies.has(f.companyId)) continue;
    push({ key: `fund:${T.pubId(f.companyId)}:${f.at.slice(0, 10)}`, kind: "funding", at: new Date(at).toISOString(), atMs: at, companyId: f.companyId, engagementId: null, fn: null, title: null, round: f.round, amount: f.amount });
  }

  // 5. First sales hires posted, or a jump in them (the career feeds' counts).
  for (const [companyId, r] of Object.entries(s.salesBuild ?? {})) {
    if (!g.companies.has(companyId)) continue;
    for (const x of r.rises ?? []) {
      const at = Date.parse(x.at);
      if (!inWindow(at)) continue;
      push({ key: `build:${T.pubId(companyId)}:${x.at.slice(0, 10)}`, kind: "sales-build", at: new Date(at).toISOString(), atMs: at, companyId, engagementId: null, fn: null, title: null, build: { from: x.from, to: x.to } });
    }
  }

  // 6. A leader gone from the company's own website.
  for (const x of s.leaderDepartures ?? []) {
    const at = Date.parse(x.at);
    if (!inWindow(at) || !g.companies.has(x.companyId)) continue;
    push({ key: `gone:${T.pubId(x.companyId)}:${x.fn}:${x.at.slice(0, 10)}`, kind: "departure", at: new Date(at).toISOString(), atMs: at, companyId: x.companyId, engagementId: null, fn: x.fn, title: null, gone: { kind: x.kind, level: x.level } });
  }

  return out.sort((a, b) => b.atMs - a.atMs);
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

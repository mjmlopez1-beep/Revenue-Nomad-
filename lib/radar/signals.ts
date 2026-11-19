/**
 * The radar's signals, found in the table (server only). A signal here still carries internal ids
 * and the company's name: lib/radar/present.ts cuts it to what a member's plan shows before
 * anything leaves the server.
 *
 * When each one happened, and what counts:
 *   adjacent  a fractional leadership hire (a hire whose title doesn't read below Lead, as Recently
 *             hired counts them: isLeaderHire in app/post/model.ts) came into the table in the
 *             window: the day a member added the seat, the day the seat scan added it
 *             (SeedEngagement.addedAt), or the day a member named who took an open role
 *             (lib/hireAlerts.ts seatAddedTimes). Its start is in the last 12 months: an old seat
 *             found today is no news.
 *   role      an open role first seen by the scan in the window, still open, listed in its last
 *             scan, and posted in the last 14 days when the board says (the weekly email's "new").
 *   seat      a seat's end month was recorded in the window (a member added or corrected it), or
 *             its status became Ended, and it ended in the last 6 months. Leadership seats only.
 *   funding   an event from lib/radar/sources/funding.ts (none until a provider is added).
 * Firms kept for an admin's review are no clients: nothing there is a signal.
 */
import { tableInternals as T, type Seed, type State } from "../table";
import { FRACTIONAL_TYPES } from "../tableFields";
import { hireMonth, monthsAgo } from "../hired";
import { seatAddedTimes } from "../hireAlerts";
import { titleWithout } from "../scan/clean";
import { siteKey } from "../tableFields";
import type { RadarKind } from "./types";
import type { FundingCompany, FundingEvent } from "./sources/funding";

/** An adjacent hire is news while its start is at most this many months ago. */
export const HIRE_FRESH_MONTHS = 12;
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
}

export interface RawSignal {
  /** Never the same key twice to a member: "role:<seat public id>", "hire:…", "end:…", "fund:<company public id>:<day>". */
  key: string;
  kind: RadarKind;
  at: string;
  atMs: number;
  /** Internal ids: never sent. */
  companyId: string;
  engagementId: string | null;
  /** The function hired, the open role's, the ended seat's. Null for funding. */
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
  };
}

/** The companies on Merlin, as a funding provider is asked about them. */
export function fundingCompanies(seed: Seed, s: State): FundingCompany[] {
  const g = T.graph(seed, s);
  const firms = T.firmsInReview(seed, s);
  return [...g.companies.values()].filter((c) => !firms.has(c.id)).map((c) => ({ id: c.id, name: c.name, domain: siteKey(T.live(c, s, "website")) || null }));
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
  const out: RawSignal[] = [];
  const push = (x: Omit<RawSignal, "co" | "hiredFns" | "atMs"> & { atMs?: number }) => {
    if (firms.has(x.companyId)) return;
    const co = companyFacts(g, s, x.companyId);
    if (!co) return;
    const ft = Object.entries(s.leaders?.[x.companyId]?.functions ?? {}).filter(([, l]) => l.kind === "full-time");
    out.push({ ...x, atMs: x.atMs ?? Date.parse(x.at), co, hiredFns: hiredFns(x.companyId), ...(ft.length ? { ledFullTime: Object.fromEntries(ft.map(([fn, l]) => [fn, l.since?.slice(0, 4) ?? ""])) } : {}) });
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
    push({ key: `hire:${T.pubId(e.id)}`, kind: "adjacent", at: new Date(at).toISOString(), atMs: at, companyId: e.companyId, engagementId: e.id, fn, title: null });
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
    push({ key: `end:${T.pubId(e.id)}`, kind: "seat", at: new Date(at).toISOString(), atMs: at, companyId: e.companyId, engagementId: e.id, fn, title: null });
  }

  // 4. Funding, from the source (nothing until a provider is added).
  for (const f of funding) {
    const at = Date.parse(f.at);
    if (!inWindow(at) || !g.companies.has(f.companyId)) continue;
    push({ key: `fund:${T.pubId(f.companyId)}:${f.at.slice(0, 10)}`, kind: "funding", at: new Date(at).toISOString(), atMs: at, companyId: f.companyId, engagementId: null, fn: null, title: null, round: f.round, amount: f.amount });
  }

  return out.sort((a, b) => b.atMs - a.atMs);
}

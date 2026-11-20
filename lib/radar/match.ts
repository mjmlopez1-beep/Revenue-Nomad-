/**
 * Which signals are for which member, and how likely each one is to become their next client.
 * Pure, apart from beforeSuggested, which reads the table.
 *
 * Hard filters (unchanged):
 *   - The company is in the member's Ideal Fractional Profile, read the way the table's profile
 *     pill reads it (icpTest in app/post/model.ts): no known fact conflicts, and at least one part
 *     the profile asks for is on file and matches. A member with no profile matches nothing.
 *   - role, seat and departure: the role, seat or departed leader is in the member's function.
 *   - adjacent: a hire in another function, at a company with no fractional in the member's own
 *     function yet. A sales build: the same "no fractional yet". Funding: any function.
 *   A member with no function (or "Other") has no radar: nothing says what's theirs.
 *
 * The score (scoreFor), one list for every kind:
 *   likelihood x timing x fit x penalties, with
 *   likelihood  P(the member's function is next | the company's recent fractional seats, its stage
 *               and ownership), lib/radar/predict.ts, after Merlin's own transitions (counts). An
 *               open role or an ended seat in their function is direct: near the top (ROLE_P, SEAT_P).
 *   timing      the rule's gap window over the months since the seat started (predict.ts timing).
 *   fit         FIT_BASE to 1, by how many parts the profile asks about are on file and match.
 *   penalties   a full-time leader of the member's function known there (its website, or members say so,
 *               lib/leaders/types.ts fnKnow): x FT_PENALTY and capped under Medium (the page only);
 *               nobody has read their team page in 90 days (leadership unknown): capped under High, and
 *               the line says only what we know ("No fractional Sales leader on Merlin. We haven't checked
 *               their team page yet"); an ended seat that went to a full-time hire: x FT_PENALTY.
 *   adjacent    scored on the card's own seat (the headline's, the why-now line's); dropped once past its
 *               window by WINDOW_GRACE months; a thin-prior function's likelihood lifted (thinLift, to
 *               Medium at most) with its floor lowered by the same; a hire that read Low when it came in
 *               comes back once (`reopen`) when its window opens and it reads Medium or High.
 *   The member's own "usually hired before you" answer (Profile.before) no longer decides who gets
 *   a hire: a pair they named is boosted (BEFORE_BOOST: they know their market).
 * Cards rank by score. Each carries a band (High, Medium, Low) and a why-now line.
 */
import { tableInternals as T, type Seed, type State } from "../table";
import { countryKey } from "../mcp/alerts";
import { beforeOrder } from "@/app/onboard/firstView";
import type { CoInfo } from "@/app/post/model";
import type { CompanyRec, EngagementRec, Icp } from "../tableTypes";
import type { CompanyFacts, RawSignal } from "./signals";
import { isLeaderRaw } from "./signals";
import type { RadarBand } from "./types";
import {
  HIGH_AT, MEDIUM_AT, SCORE_FLOOR, SIGNAL_PRIORS, agoWords, bandOf, gapWords, hireWhyNow, isStage, leadWord, likelihood, ownerOf, thinLift, timing, windowGone, windowOpensMs, type TransitionCounts,
} from "./predict";
import { fullTimeWords, noLeaderWords, type FnKnow, type LeaderHow, type LeaderLevel } from "../leaders/types";
import { hireMonth, monthsAgo } from "../hired";
import type { Warmth } from "../google/types"; // [google network]

export interface RadarProfile {
  memberId: string;
  fn: string | null;
  icp: Icp | null;
  /** Functions that usually come before theirs. */
  before: string[];
  /** `before` is the member's own answer (else the suggestion). */
  beforeFromMember: boolean;
}

/** An open role in the member's function: the most direct signal there is. */
export const ROLE_P = 1;
/** A seat like theirs just ended. */
export const SEAT_P = 0.85;
/** A full-time leader of their function on file (or an ended seat that went full-time): the score is cut to this share. */
export const FT_PENALTY = 0.35;
/** Fit runs from this (one part of the profile on file and matching, the rest unknown) to 1 (every part on file and matching). */
export const FIT_BASE = 0.7;
/** A pair the member named themselves: the chance it misses is cut by this share. */
export const BEFORE_BOOST = 0.15;

export const icpIsEmpty = (icp: Icp | null | undefined) => !icp || !(icp.industries.length || icp.employees.length || icp.revenue.length || icp.countries.length);

/** Each part the profile asks about: true (on file, matches), false (on file, doesn't), null (not on file). */
function icpParts(icp: Icp, co: CompanyFacts): (boolean | null)[] {
  const key = (v: string) => v.trim().toLowerCase();
  const parts = [
    icp.industries.length ? (co.industry ? icp.industries.map(key).includes(key(co.industry)) : null) : undefined,
    icp.employees.length ? (co.employees ? icp.employees.includes(co.employees) : null) : undefined,
    icp.revenue.length ? (co.revenue ? icp.revenue.includes(co.revenue) : null) : undefined,
    icp.countries.length ? (co.country ? icp.countries.some((x) => countryKey(x) === countryKey(co.country!)) : null) : undefined,
  ];
  return parts.filter((x): x is boolean | null => x !== undefined);
}

/** The company against the profile: icpTest's rule on the company's free facts. */
export function inIcp(icp: Icp | null | undefined, co: CompanyFacts): boolean {
  if (icpIsEmpty(icp)) return false;
  const parts = icpParts(icp!, co);
  if (parts.includes(false)) return false;
  return parts.includes(true);
}

/** How well the company fits the profile, from FIT_BASE to 1. Only for a company inIcp. */
export function fitOf(icp: Icp, co: CompanyFacts): number {
  const parts = icpParts(icp, co);
  const yes = parts.filter((x) => x === true).length;
  return parts.length ? FIT_BASE + (1 - FIT_BASE) * (yes / parts.length) : FIT_BASE;
}

/**
 * What we know about who leads `fn` at the signal's company (lib/leaders/types.ts fnKnow, as
 * detectSignals read it): a full-time leader on its website or one members say is in place, a
 * team page read in the last 90 days that names nobody in it, or nothing (unknown). A signal with
 * no `lead` at all is unknown too: never "nobody leads it" unless a team page said so.
 */
export function knowOf(sig: Pick<RawSignal, "lead" | "ledFullTime" | "hiredFns">, fn: string): FnKnow {
  const ft = sig.lead?.ft[fn];
  if (ft) return { s: "full-time", how: ft.how as LeaderHow, level: ft.level as LeaderLevel, ...(ft.since ? { since: ft.since } : {}), ...(ft.role ? { role: ft.role } : {}), confirmed: ft.confirmed };
  if (sig.ledFullTime && fn in sig.ledFullTime) return { s: "full-time", how: "team page", level: "Head", ...(sig.ledFullTime[fn] ? { since: sig.ledFullTime[fn] } : {}), confirmed: true };
  if (sig.lead?.teamAt) return { s: "none", teamAt: sig.lead.teamAt };
  return { s: "unknown" };
}
/** The honest words about who leads `fn` there: "FT Sales Leader since 2024", "Members say: full-time CRO", "No Sales leader on their team page (checked Nov 2026)", or "No fractional Sales leader on Merlin. We haven't checked their team page yet". */
export const leaderLine = (sig: Pick<RawSignal, "lead" | "ledFullTime" | "hiredFns">, fn: string) => {
  const k = knowOf(sig, fn);
  return fullTimeWords(fn, k) ?? noLeaderWords(fn, k) ?? `No fractional ${fn} leader on Merlin`;
};

/** A full-time leader of the member's function is known there: the signal stays on the page only, under Medium (FT_PENALTY, then capped). */
export const FT_CAP = MEDIUM_AT * 0.99;
/** Nobody has read their team page: never High on "nobody leads it yet" alone (capped under HIGH_AT). */
export const UNKNOWN_CAP = HIGH_AT * 0.99;

/** Why a signal is for this member, or null when it isn't (the hard filters). */
export function matchWhy(sig: RawSignal, p: RadarProfile): string | null {
  if (!p.fn || p.fn === "Other" || !inIcp(p.icp, sig.co)) return null;
  switch (sig.kind) {
    case "role":
      return sig.fn === p.fn ? `An open ${p.fn} role, at a company in your profile` : null;
    case "seat":
      return sig.fn === p.fn ? `A ${p.fn} seat like yours, at a company in your profile` : null;
    case "departure":
      return sig.fn === p.fn ? `Their ${p.fn} seat may need cover, at a company in your profile` : null;
    case "adjacent": {
      if (!sig.fn || sig.fn === p.fn || sig.hiredFns.includes(p.fn)) return null;
      const comes = p.before.includes(sig.fn) ? `${sig.fn} usually comes before ${p.fn}` : `A fractional ${sig.fn} hire`;
      return `${comes}. ${leaderLine(sig, p.fn)}`;
    }
    case "sales-build":
      return sig.hiredFns.includes(p.fn) ? null : `A sales team being built. ${leaderLine(sig, p.fn)}`;
    case "funding":
      return "Money in usually means hiring, at a company in your profile";
  }
}

/** A signal scored for one member. */
export interface Scored extends RawSignal {
  why: string;
  score: number;
  band: RadarBand;
  whyNow: string;
}

export interface ScoreCtx {
  /** Merlin's observed transitions (signals.ts observedTransitions). None: the research's priors alone. */
  counts?: TransitionCounts | null;
  nowMs?: number;
  /** [google network] How well the member knows someone at a company (lib/google/types.ts networkWarmth). Ranks only: the band stays the score's. */
  warmth?: (companyId: string) => Warmth | null;
}

/**
 * [google network] The ranking is likelihood x timing x warmth: a company where the member knows
 * someone ranks higher by how warm that is. Only the order changes, never the score or the band.
 */
export const warmthMultiplier = (w: Warmth | null | undefined) => (w === "Hot" ? 1.6 : w === "Warm" ? 1.35 : w === "Fading" ? 1.15 : w === "Cold" ? 1.05 : 1);

const MONTH_MS = 30.44 * 24 * 60 * 60 * 1000;
const sinceMonths = (atMs: number, nowMs: number) => Math.max(0, Math.floor((nowMs - atMs) / MONTH_MS));

/** The score, band and why-now of one signal for one member, or null when it isn't theirs. */
export function scoreFor(sig: RawSignal, p: RadarProfile, ctx: ScoreCtx = {}): Scored | null {
  const why = matchWhy(sig, p);
  if (!why || !p.fn) return null;
  const nowMs = ctx.nowMs ?? Date.now();
  const fit = fitOf(p.icp!, sig.co);
  const stage = isStage(sig.stage) ? sig.stage : null;
  const owner = ownerOf(sig.owner);
  const know = knowOf(sig, p.fn);
  const ftLed = know.s === "full-time";
  let score: number;
  let whyNow: string;
  /** A re-surfaced hire: the time its window opened for this member (the card's time). */
  let openedMs: number | null = null;
  /** Adjacent, for a thin-prior function: its floor is lowered by its lift. */
  let floorLift = 1;
  switch (sig.kind) {
    case "role":
      score = ROLE_P * fit;
      whyNow = `Open now · a direct opening in ${p.fn}`;
      break;
    case "seat": {
      const fullTime = sig.endReason === "Converted to full-time" || sig.endReason === "Replaced by full-time hire";
      score = SEAT_P * fit * (fullTime ? FT_PENALTY : 1);
      whyNow = fullTime
        ? `Just ended ${sig.endReason === "Converted to full-time" ? "as a full-time role" : "with a full-time hire"} · less likely to open again`
        : "Just ended · the seat may be open again";
      break;
    }
    case "departure": {
      const pr = SIGNAL_PRIORS.departure["*"];
      score = pr.p * timing(sinceMonths(sig.atMs, nowMs), pr.gap) * fit;
      whyNow = `${leadWord(p.fn)} gone from its website · ${pr.why} ${gapWords(pr.gap)}`;
      break;
    }
    case "sales-build": {
      const jump = !!sig.build && sig.build.from > 0;
      const pr = SIGNAL_PRIORS[jump ? "sales-jump" : "sales-build"][p.fn];
      const t = sinceMonths(sig.atMs, nowMs);
      const p0 = pr ? pr.p : 0.02;
      const gap = pr ? pr.gap : ([3, 12] as const);
      score = p0 * timing(t, gap) * fit * (ftLed ? FT_PENALTY : 1);
      const posted = jump ? `${sig.build!.to} full-time sales roles posted` : "First full-time sales roles posted";
      whyNow = pr ? `${posted} · ${pr.why} ${gapWords(gap)}` : `${posted} · a sales build sometimes brings other seats`;
      break;
    }
    case "funding": {
      const pr = SIGNAL_PRIORS.funding[p.fn];
      score = (pr ? pr.p : 0.08) * timing(sinceMonths(sig.atMs, nowMs), pr ? pr.gap : [0, 6]) * fit;
      whyNow = pr ? `Raised money · ${pr.why} ${gapWords(pr.gap)}` : "Raised money · a round usually brings new seats";
      break;
    }
    case "adjacent": {
      // The card's own seat, and only it: the headline, the why-now line and the score are about the same hire.
      const x = { fn: sig.fn!, ym: sig.ym ?? hireMonth(sig.at.slice(0, 7)) };
      if (!x.ym || x.fn === p.fn) return null;
      const l = likelihood(x.fn, p.fn, stage, owner, { employees: sig.co.employees, businessModel: sig.co.model ?? null }, ctx.counts);
      const named = p.beforeFromMember && p.before.includes(x.fn);
      const lp = named ? 1 - (1 - l.p) * (1 - BEFORE_BOOST) : l.p;
      const t = Math.max(0, monthsAgo(x.ym, nowMs));
      // Long past its window: nothing to say on a card.
      if (windowGone(t, l.gap)) return null;
      // A function the rules seldom name (Growth, Customer Success, Partnerships, AI GTM, Product) is read against its own ceiling, at most to Medium.
      const raw = lp * timing(t, l.gap);
      const lift = thinLift(p.fn);
      floorLift = lift;
      score = (lift > 1 ? Math.min(raw * lift, Math.max(raw, UNKNOWN_CAP)) : raw) * fit;
      whyNow = hireWhyNow(x.fn, p.fn, t, l);
      if (sig.reopen) {
        // Re-surfaced once: this member's window opens in this run's window, after the hire came in.
        const open = windowOpensMs(x.ym, l.gap[0]);
        if (!(l.gap[0] > 0 && open > sig.reopen.from && open <= sig.reopen.to && open > (sig.addedMs ?? 0))) return null;
        openedMs = open;
      }
      break;
    }
  }
  // Who leads the member's function there: a full-time leader known (website or members) keeps it on the page only;
  // nobody has read their team page: never High on "nobody leads it yet" alone.
  if (sig.kind === "adjacent" || sig.kind === "sales-build") {
    if (ftLed) score = Math.min(score * (sig.kind === "adjacent" ? FT_PENALTY : 1), FT_CAP);
    else if (know.s === "unknown") score = Math.min(score, UNKNOWN_CAP);
  }
  // A thin-prior function's adjacent hires keep a floor lowered by the same lift, so its members get them at all (Low, on the page).
  if (!(score >= SCORE_FLOOR / floorLift)) return null;
  const band = bandOf(score);
  // A re-surfaced hire goes out only when it now reads Medium or High (Low never goes by email).
  if (openedMs !== null) {
    if (band === "Low") return null;
    return { ...sig, at: new Date(openedMs).toISOString(), atMs: openedMs, why, score, band, whyNow };
  }
  return { ...sig, why, score, band, whyNow };
}

/** The months-ago words, for lines that are not a hire's ("this month", "2 months ago"). */
export const sinceWords = (atMs: number, nowMs: number) => agoWords(sinceMonths(atMs, nowMs));

const KIND_RANK: Record<RawSignal["kind"], number> = { role: 0, seat: 1, departure: 2, adjacent: 3, "sales-build": 4, funding: 5 };

/** The signals for this member, ranked by score (most likely first); ties by kind (roles first), then newest. */
export function signalsFor(all: RawSignal[], p: RadarProfile, ctx: ScoreCtx = {}): Scored[] {
  const w = (x: Scored) => x.score * warmthMultiplier(ctx.warmth?.(x.companyId)); // [google network]
  return all
    .map((x) => scoreFor(x, p, ctx))
    .filter((x): x is Scored => !!x)
    .sort((a, b) => w(b) - w(a) || KIND_RANK[a.kind] - KIND_RANK[b.kind] || b.atMs - a.atMs || a.key.localeCompare(b.key));
}

/** What goes by email and Slack: everything but Low (Low stays on the page). */
export const deliverable = <X extends { band: RadarBand }>(xs: X[]) => xs.filter((x) => x.band !== "Low");

/**
 * The functions onboarding would suggest as "usually hired before" `fn`, from the table's
 * leadership hires (beforeOrder). Its rows are read from the state, not from a member's view:
 * only the free facts beforeOrder reads (function, start, type) and the leadership flag, which the
 * server sets the same for every member. Kept per state.
 */
const suggestedMemo = new WeakMap<State, Map<string, string[]>>();
const infosMemo = new WeakMap<State, CoInfo[]>();
export function beforeSuggested(seed: Seed, s: State, fn: string | null): string[] {
  let m = suggestedMemo.get(s);
  if (!m) suggestedMemo.set(s, (m = new Map()));
  const k = fn ?? "";
  const hit = m.get(k);
  if (hit) return hit;
  let infos = infosMemo.get(s);
  if (!infos) {
    const g = T.graph(seed, s);
    const tracks = T.tracksOf(seed, s);
    const firms = T.firmsInReview(seed, s);
    const byCo = new Map<string, EngagementRec[]>();
    for (const e of g.engagements.values()) {
      if (firms.has(e.companyId) || !isLeaderRaw(e, s, tracks)) continue;
      const cell = (v: string | null) => (v ? { s: "value" as const, v, ver: 0 } : { s: "empty" as const });
      // Only leadership hires go in, so the row reads as one (no open role, not below Lead).
      const rec = {
        id: e.id,
        source: "radar",
        verified: false,
        cells: { function: cell(T.fnOf(e, s)), start: cell(T.live(e, s, "start")), type: cell(T.live(e, s, "type")), operator: { s: "locked" as const, ver: 0 } },
        people: [],
        updatedAt: null,
        yours: false,
        opened: null,
        closed: null,
      } as EngagementRec;
      const l = byCo.get(e.companyId) ?? [];
      l.push(rec);
      byCo.set(e.companyId, l);
    }
    infos = [...byCo.values()].map((engs) => ({ c: {} as CompanyRec, engs }) as unknown as CoInfo);
    infosMemo.set(s, infos);
  }
  const out = beforeOrder(infos, fn).suggested;
  m.set(k, out);
  return out;
}

/** The member's radar profile: function, Ideal Fractional Profile, and the functions before theirs. */
export function profileOf(seed: Seed, s: State, memberId: string, fn: string | null): RadarProfile {
  const prof = s.profiles[memberId] ?? {};
  const own = Array.isArray(prof.before) ? prof.before.filter((x) => typeof x === "string" && x !== fn) : [];
  return {
    memberId,
    fn: fn && fn !== "Other" ? fn : null,
    icp: prof.icp ?? null,
    before: own.length ? own : fn && fn !== "Other" ? beforeSuggested(seed, s, fn) : [],
    beforeFromMember: own.length > 0,
  };
}

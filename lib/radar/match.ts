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
 *   tenure      a seat in the member's function at its tenure mark (predict.ts TENURE_PRIOR), never their own seat.
 *   rehire      the same function (REHIRE_SAME_P) or one a transition rule names after it (the rule x
 *               REHIRE_NEXT_SHARE), while no fractional in the member's function is active there.
 *   arrival     a new full-time leader whose function ARRIVAL_PRIORS ties to the member's.
 *   team-build  hiring in the member's own function (TEAM_PRIORS); a full-time leader of it known: page only.
 *   headcount   a size band rule 9 ties to People (HEADCOUNT_PRIORS).
 *   gap         the member's function's share of fractional seats at the company's stage (propensity), never High.
 *   A standing state (signals.ts standingSignals) scores as its kind does, and its why-now starts "Still a
 *   good time:". pickDaily makes the member's day from the ranked lists.
 * Cards rank by score. Each carries a band (High, Medium, Low) and a why-now line.
 */
import { tableInternals as T, type Seed, type State } from "../table";
import { countryKey } from "../mcp/alerts";
import { beforeOrder } from "@/app/onboard/firstView";
import type { CoInfo } from "@/app/post/model";
import type { CompanyRec, EngagementRec, Icp } from "../tableTypes";
import type { CompanyFacts, RawSignal } from "./signals";
import { isCalendar, isLeaderRaw } from "./signals";
import { RADAR_COMPANY_QUIET_DAYS, RADAR_DAY_MAX, RADAR_DAY_MIN, RADAR_STILL, type RadarBand } from "./types";
import {
  ARRIVAL_PRIORS, GAP_MIN_SHARE, HEADCOUNT_PRIORS, HIGH_AT, MEDIUM_AT, REHIRE_MONTHS, REHIRE_NEXT_SHARE, REHIRE_SAME_P, SCORE_FLOOR, SIGNAL_PRIORS, TEAM_PRIORS, TENURE_MARKS, TENURE_PRIOR, agoWords, bandOf, gapWords,
  hireWhyNow, isStage, leadWord, likelihood, monthSpan, monthWords, ownerOf, propensity, thinLift, timing, windowGone, windowOpensMs, windowPassed, type TenureMark, type TransitionCounts,
} from "./predict";
import { LEADER_LEVELS, fullTimeWords, noLeaderWords, roleLabel, type FnKnow, type LeaderHow, type LeaderLevel } from "../leaders/types";
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
  /**
   * [ux ws3] No Ideal Fractional Profile reads as any company (the page, radarView), so skipping the
   * profile never switches Crystal Ball off. Left out (the morning run): no profile, nothing sent.
   */
  any?: boolean;
}

/** [ux ws3] The profile reads as any company: asked for (`any`) and nothing in it. */
export const anyCompany = (p: Pick<RadarProfile, "any" | "icp">) => !!p.any && icpIsEmpty(p.icp);

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
  const any = anyCompany(p);
  if (!p.fn || p.fn === "Other" || (!any && !inIcp(p.icp, sig.co))) return null;
  // A member is never sent their own seat.
  if (sig.holderId && sig.holderId === p.memberId) return null;
  // A fractional in their function there now: nothing for them in a signal that reads "no fractional in your function".
  const activeHere = (sig.activeFns ?? sig.hiredFns).includes(p.fn);
  // Any company (no profile yet): the reason says what happened, never "in your profile".
  const where = any ? "" : ", at a company in your profile";
  switch (sig.kind) {
    case "role":
      return sig.fn === p.fn ? `An open ${p.fn} role${where}` : null;
    case "seat":
      return sig.fn === p.fn ? `A ${p.fn} seat like yours${where}` : null;
    case "departure":
      return sig.fn === p.fn ? `Their ${p.fn} seat may need cover${where}` : null;
    case "adjacent": {
      if (!sig.fn || sig.fn === p.fn || sig.hiredFns.includes(p.fn)) return null;
      const comes = p.before.includes(sig.fn) ? `${sig.fn} usually comes before ${p.fn}` : `A fractional ${sig.fn} hire`;
      return `${comes}. ${leaderLine(sig, p.fn)}`;
    }
    case "sales-build":
      return sig.hiredFns.includes(p.fn) ? null : `A sales team being built. ${leaderLine(sig, p.fn)}`;
    case "funding":
      return `Money in usually means hiring${where}`;
    case "tenure":
      return sig.fn === p.fn ? `A fractional ${p.fn} seat like yours, ${sig.tenure?.months ?? 12} months in${where}` : null;
    case "rehire":
      if (!sig.fn || activeHere) return null;
      return sig.fn === p.fn ? `They hired a fractional ${p.fn} before${where}` : `They hired a fractional ${sig.fn} before. ${leaderLine(sig, p.fn)}`;
    case "arrival":
      return sig.fn && ARRIVAL_PRIORS[sig.fn]?.[p.fn] && !activeHere ? `A new ${sig.fn} leader there. ${leaderLine(sig, p.fn)}` : null;
    case "team-build":
      return sig.fn === p.fn && TEAM_PRIORS[p.fn] && !activeHere ? `A ${p.fn} team being hired. ${leaderLine(sig, p.fn)}` : null;
    case "headcount":
      return sig.size && HEADCOUNT_PRIORS[sig.size.to]?.[p.fn] && !sig.hiredFns.includes(p.fn) ? `Growing. ${leaderLine(sig, p.fn)}` : null;
    case "gap":
      return sig.fn === p.fn && !sig.hiredFns.includes(p.fn) ? `No ${p.fn} leader on their team page${where}` : null;
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
/** How a standing state's why-now starts: it is still true, nothing new happened today. */
export const STILL = RADAR_STILL;
/** "marketing", "engineering": a function's team as a career feed's roles read. */
const TEAM_WORD: Record<string, string> = { Marketing: "marketing", Technology: "engineering", Finance: "finance", People: "people", "Customer Success": "customer success" };
const teamWord = (fn: string) => TEAM_WORD[fn] ?? fn.toLowerCase();
const sinceMonths = (atMs: number, nowMs: number) => Math.max(0, Math.floor((nowMs - atMs) / MONTH_MS));

/** The score, band and why-now of one signal for one member, or null when it isn't theirs. */
export function scoreFor(sig: RawSignal, p: RadarProfile, ctx: ScoreCtx = {}): Scored | null {
  const why = matchWhy(sig, p);
  if (!why || !p.fn) return null;
  const nowMs = ctx.nowMs ?? Date.now();
  const fit = anyCompany(p) ? FIT_BASE : fitOf(p.icp!, sig.co);
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
        // Re-surfaced once: this member's window opens in this run's window, after the hire came in (on the seat's own day of the month).
        const open = windowOpensMs(x.ym, l.gap[0], sig.engagementId ?? sig.key);
        if (!(l.gap[0] > 0 && open > sig.reopen.from && open <= sig.reopen.to && open > (sig.addedMs ?? 0))) return null;
        openedMs = open;
      }
      // A standing hire: only while this member's window is open now (not before it, not after it).
      if (sig.standing && (t < l.gap[0] || windowPassed(t, l.gap))) return null;
      break;
    }
    case "tenure": {
      const x = sig.tenure;
      const mark = (x && (TENURE_MARKS as readonly number[]).includes(x.mark) ? x.mark : 12) as TenureMark;
      const pr = TENURE_PRIOR[mark];
      if (!x) return null;
      const past = Math.max(0, monthsAgo(x.start, nowMs) - mark);
      score = pr.p * timing(past, pr.gap) * fit;
      whyNow = `Fractional ${p.fn} seat started ${monthWords(x.start)}, ${agoWords(monthsAgo(x.start, nowMs))} · based on typical tenure: ${pr.words}, so the seat may come up again`;
      break;
    }
    case "rehire": {
      if (!sig.fn || !sig.ended) return null;
      const span = monthSpan(sig.ended.end);
      const since = span ? Math.max(0, monthsAgo(`${Math.floor(span.to / 12)}-${String((span.to % 12) + 1).padStart(2, "0")}`, nowMs)) : REHIRE_MONTHS[0];
      if (since < REHIRE_MONTHS[0] || since > REHIRE_MONTHS[1]) return null;
      const ended = `Fractional ${sig.fn} seat there ended in ${monthWords(sig.ended.end)}`;
      const fullTime = sig.endReason === "Converted to full-time" || sig.endReason === "Replaced by full-time hire";
      if (sig.fn === p.fn) {
        score = REHIRE_SAME_P * fit * (fullTime ? FT_PENALTY : 1);
        whyNow = fullTime
          ? `${ended}, ${sig.endReason === "Converted to full-time" ? "as a full-time role" : "with a full-time hire"} · less likely to open again`
          : `${ended} · about a quarter of fractional roles come from companies that hired one before`;
      } else {
        const l = likelihood(sig.fn, p.fn, stage, owner, { employees: sig.co.employees, businessModel: sig.co.model ?? null }, ctx.counts);
        if (!l.rule) return null;
        score = l.p * REHIRE_NEXT_SHARE * fit;
        whyNow = `${ended} · they've hired fractionals before, and ${p.fn} usually follows ${sig.fn}`;
      }
      break;
    }
    case "arrival": {
      const pr = sig.fn ? ARRIVAL_PRIORS[sig.fn]?.[p.fn] : undefined;
      if (!pr || !sig.fn) return null;
      score = pr.p * timing(sinceMonths(sig.atMs, nowMs), pr.gap) * fit;
      const role = sig.arrived ? roleLabel(sig.fn, (LEADER_LEVELS as readonly string[]).includes(sig.arrived.level) ? (sig.arrived.level as LeaderLevel) : "Head") : leadWord(sig.fn);
      whyNow = `New ${sig.arrived?.kind === "full-time" ? "full-time " : ""}${role} on their team page (${monthWords(sig.at.slice(0, 7))}) · ${pr.why} ${gapWords(pr.gap)}`;
      break;
    }
    case "team-build": {
      const pr = TEAM_PRIORS[p.fn];
      if (!pr || !sig.team) return null;
      score = pr.p * timing(sinceMonths(sig.atMs, nowMs), pr.gap) * fit;
      whyNow = `${sig.team.to} full-time ${teamWord(p.fn)} roles posted (${sig.team.from} before) · ${pr.why} ${gapWords(pr.gap)}`;
      break;
    }
    case "headcount": {
      const pr = sig.size ? HEADCOUNT_PRIORS[sig.size.to]?.[p.fn] : undefined;
      if (!pr || !sig.size) return null;
      score = pr.p * timing(sinceMonths(sig.atMs, nowMs), pr.gap) * fit;
      whyNow = `Grew from ${sig.size.from} to ${sig.size.to} people (on file ${monthWords(sig.at.slice(0, 7))}) · ${pr.why}`;
      break;
    }
    case "gap": {
      const share = stage ? propensity(p.fn, stage) : 0;
      if (!stage || share < GAP_MIN_SHARE || know.s === "full-time") return null;
      // Never High: a share of seats, not a rate.
      score = Math.min(share * fit, UNKNOWN_CAP);
      const checked = know.s === "none" ? ` (checked ${monthWords(know.teamAt.slice(0, 7))})` : "";
      whyNow = `No ${p.fn} leader on their team page${checked}, and no fractional ${p.fn} seat on file · at ${stage} revenue, about 1 in ${Math.round(1 / share)} fractional seats is ${p.fn}`;
      break;
    }
  }
  // A standing state says what it is: still true, nothing new today.
  if (sig.standing) whyNow = `${STILL} ${whyNow}`;
  // Who leads the member's function there: a full-time leader known (website or members) keeps it on the page only;
  // nobody has read their team page: never High on "nobody leads it yet" alone.
  if (sig.kind === "tenure" || sig.kind === "rehire" || sig.kind === "arrival" || sig.kind === "team-build" || sig.kind === "headcount") {
    if (ftLed) score = Math.min(score * FT_PENALTY, FT_CAP);
    else if (know.s === "unknown") score = Math.min(score, UNKNOWN_CAP);
  }
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

const KIND_RANK: Record<RawSignal["kind"], number> = { role: 0, seat: 1, departure: 2, adjacent: 3, arrival: 4, "sales-build": 5, "team-build": 6, funding: 7, rehire: 8, tenure: 9, headcount: 10, gap: 11 };

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

/** What a member's day remembers: each signal key sent (when), and each company sent (when, internal id). */
export interface DayMemory {
  sent: Record<string, string>;
  shown?: Record<string, string>;
}

/**
 * A member's day (the morning run's selection): their unsent High and Medium events, most likely
 * first, at most RADAR_DAY_MAX companies (`max`: more in a twice-a-week or weekly email, RADAR_ROLLUP_MAX; a company's other signals that day ride along with it).
 * When fewer than RADAR_DAY_MIN companies come from fresh events, the strongest standing states
 * (High or Medium, never shown: none of their own events went out) fill it to RADAR_DAY_MIN,
 * labelled "Still a good time". A company sent in the last RADAR_COMPANY_QUIET_DAYS is not sent
 * again unless something new happened there: a calendar signal (a window opening, a tenure mark, a
 * rehire gap) or a standing state skips it, an event (a role, a hire, an ended seat, a leader
 * gone or arrived, a burst of hiring, money, a size change, a gap first seen) doesn't. Both lists
 * come ranked (signalsFor). Pure.
 */
export function pickDaily<X extends Scored>(fresh: X[], standing: X[], mem: DayMemory, nowMs: number, max = RADAR_DAY_MAX): { send: X[]; fromEvents: number } {
  const quiet = (companyId: string) => {
    const at = Date.parse(mem.shown?.[companyId] ?? "");
    return Number.isFinite(at) && nowMs - at < RADAR_COMPANY_QUIET_DAYS * 24 * 60 * 60 * 1000;
  };
  const unsent = (x: X) => !mem.sent[x.key] && !(x.of && mem.sent[x.of]) && !(x.sameAs ?? []).some((k) => mem.sent[k]);
  const send: X[] = [];
  const cos = new Set<string>();
  for (const x of fresh) {
    if (x.band === "Low" || !unsent(x) || (isCalendar(x) && quiet(x.companyId))) continue;
    if (cos.has(x.companyId)) {
      // The same company's other signals today, once each.
      if (!send.some((y) => y.key === x.key)) send.push(x);
    } else if (cos.size < max) {
      cos.add(x.companyId);
      send.push(x);
    }
  }
  const fromEvents = cos.size;
  if (cos.size < RADAR_DAY_MIN)
    for (const x of standing) {
      if (cos.size >= RADAR_DAY_MIN) break;
      if (x.band === "Low" || !unsent(x) || cos.has(x.companyId) || quiet(x.companyId)) continue;
      cos.add(x.companyId);
      send.push(x);
    }
  return { send, fromEvents };
}

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

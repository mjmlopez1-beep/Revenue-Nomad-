/**
 * How likely each company in a member's network is to hire a fractional in the member's function,
 * scored live with Crystal Ball's own likelihood and timing (lib/radar/predict.ts, read here, never
 * changed), not only for the companies in today's delivered day. Server only: it reads the table's
 * seats the way Crystal Ball's signals do (lib/radar/signals.ts).
 *
 * For one company, the strongest of:
 *   - an open role in the member's function: ROLE_P (High), "Open RevOps role now";
 *   - a seat in their function that ended in the last END_FRESH_MONTHS: SEAT_P;
 *   - a fractional leadership hire in another function in the last HIRE_FRESH_MONTHS:
 *     P(their function next | that hire, the company's stage and ownership) x timing, as Crystal
 *     Ball scores an adjacent hire, with its why-now line;
 *   - a fractional in their function there now: Low, said as it is ("Has a fractional RevOps leader now").
 * Nothing on file: Low, "No hiring sign on Merlin yet". Never a percentage: a band and a reason.
 * As Crystal Ball does, the score is times the profile's fit (FIT_BASE outside the profile), and an
 * adjacent hire alone stays under High (UNKNOWN_CAP: nobody here has read who leads the function),
 * so a company reads the same band here as on Crystal Ball's page.
 */
import { tableInternals as T, type Seed, type State } from "../table";
import { hireMonth, monthsAgo } from "../hired";
import { HIRE_FRESH_MONTHS, END_FRESH_MONTHS, companyFacts, isLeaderRaw, observedTransitions, ownershipOf, stageOf } from "../radar/signals";
import { bandOf, hireWhyNow, isStage, likelihood, ownerOf, timing, windowGone, agoWords } from "../radar/predict";
import { FIT_BASE, ROLE_P, SEAT_P, UNKNOWN_CAP, fitOf, inIcp } from "../radar/match";
import type { Icp } from "../tableTypes";
import type { HireOdds } from "./types";

type G = ReturnType<typeof T.graph>;
type EngNode = G["engagements"] extends Map<string, infer V> ? V : never;

const named = (fn: string | null | undefined) => (fn && fn !== "Other" ? fn : null);
/** A fractional in their function there now: kept on the list, read Low. */
const HELD_SCORE = 0.02;

const seatsMemo = new WeakMap<State, Map<string, EngNode[]>>();
function seatsByCompany(g: G, s: State): Map<string, EngNode[]> {
  let m = seatsMemo.get(s);
  if (!m) {
    m = new Map();
    for (const e of g.engagements.values()) {
      const l = m.get(e.companyId) ?? [];
      l.push(e);
      m.set(e.companyId, l);
    }
    seatsMemo.set(s, m);
  }
  return m;
}

/** Each of `ids` (internal) scored for `fn`, or an empty map without a function. */
export function oddsFor(seed: Seed, s: State, ids: Iterable<string>, fn: string | null, nowMs = Date.now(), icp: Icp | null = null): Map<string, HireOdds> {
  const out = new Map<string, HireOdds>();
  const mine = named(fn);
  if (!mine) return out;
  const g = T.graph(seed, s);
  const tracks = T.tracksOf(seed, s);
  const by = seatsByCompany(g, s);
  const counts = observedTransitions(seed, s);
  for (const id of ids) {
    const seats = by.get(id) ?? [];
    const facts = companyFacts(g, s, id);
    if (!facts) continue;
    const owner = ownerOf(ownershipOf(s, id, seats));
    const fit = icp && inIcp(icp, facts) ? fitOf(icp, facts) : FIT_BASE;
    let best: HireOdds | null = null;
    const take = (o: HireOdds) => {
      const score = o.score * fit;
      const x = { ...o, score, band: o.band === "Low" && o.score <= HELD_SCORE ? "Low" : bandOf(score) } as HireOdds;
      if (!best || x.score > best.score) best = x;
    };
    for (const e of seats) {
      const efn = named(T.fnOf(e, s));
      if (!efn) continue;
      if (T.isOpenRole(e, s, tracks)) {
        if (efn === mine) take({ band: "High", score: ROLE_P, why: `Open ${mine} role now · a direct opening`, saw: { kind: "role", line: `New open role: ${T.live(e, s, "role") ?? `Fractional ${mine}`}` } });
        continue;
      }
      if (!isLeaderRaw(e, s, tracks)) continue;
      const status = T.live(e, s, "status");
      const end = hireMonth(T.live(e, s, "end"));
      const ended = status === "Ended" || (!!end && monthsAgo(end, nowMs) > 0);
      if (efn === mine) {
        if (ended && end && monthsAgo(end, nowMs) <= END_FRESH_MONTHS)
          take({ band: bandOf(SEAT_P), score: SEAT_P, why: `Their ${mine} seat ended ${agoWords(monthsAgo(end, nowMs))} · the seat may be open again`, saw: { kind: "seat", line: `A fractional ${mine} seat ended` } });
        else if (!ended) take({ band: "Low", score: HELD_SCORE, why: `Has a fractional ${mine} leader now`, saw: null });
        continue;
      }
      const ym = hireMonth(T.live(e, s, "start"));
      if (!ym) continue;
      const t = Math.max(0, monthsAgo(ym, nowMs));
      if (t > HIRE_FRESH_MONTHS) continue;
      const stage = stageOf(s, e, facts.revenue);
      const l = likelihood(efn, mine, isStage(stage) ? stage : null, owner, { employees: facts.employees, businessModel: facts.model ?? null }, counts);
      if (windowGone(t, l.gap)) continue;
      const score = Math.min(l.p * timing(t, l.gap), UNKNOWN_CAP);
      take({ band: bandOf(score), score, why: hireWhyNow(efn, mine, t, l), saw: { kind: "adjacent", line: `Hired a fractional ${efn} leader` } });
    }
    out.set(id, best ?? { band: "Low", score: 0, why: "No hiring sign on Merlin yet", saw: null });
  }
  return out;
}

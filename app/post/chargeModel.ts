/**
 * "What to charge them" on a company's record (Charge.tsx): which benchmark figure the panel
 * reads, what it may print, and where the member's own rate sits. Pure, no React, so
 * scripts/test-google.mts checks it on the benchmarks exactly as the server sends them.
 *
 * It adds no rule of its own. The figures are the Rate benchmarks page's (View.benchmarks,
 * lib/table.ts rateStat): a median only once a figure's floor is met (RateStat.min: 5 people, or 20
 * with Rate Index data), the middle half only when the server sent it (10 people, Pro or trial),
 * client-size rows only off Free. Below a floor the panel prints how many of the people it needs
 * have reported, never an amount. The member's own rates come from their own Me and their own
 * seats: they are left out of the figures they see (RateStat.withoutYours), and go to nobody else.
 */
import type { BenchRate, BenchmarkRow, Benchmarks, RateStat } from "@/lib/tableTypes";
import { FUNCTIONS, RN_REVENUE } from "@/lib/tableFields";
import { readRate } from "@/lib/rates";

export type RateKind = "monthly" | "hourly";

/** One figure as the panel may print it. */
export type Figure =
  | { state: "range"; p25: number; median: number; p75: number; n: number; stat: RateStat }
  | { state: "median"; median: number; n: number; stat: RateStat; /** The range is Pro's (Free, with enough people for one). */ rangeLocked: boolean; /** People a range needs. */ rangeAt: number }
  | { state: "few"; n: number; min: number; stat: RateStat };

export function figureOf(s: RateStat, b: Pick<Benchmarks, "rangeN" | "limited">): Figure {
  const rangeAt = b.rangeN ?? 10;
  // No median from the server: below the floor. Nothing but the count is printed.
  if (s.median === undefined) return { state: "few", n: s.n, min: s.min, stat: s };
  if (s.p25 !== undefined && s.p75 !== undefined) return { state: "range", p25: s.p25, median: s.median, p75: s.p75, n: s.n, stat: s };
  return { state: "median", median: s.median, n: s.n, stat: s, rangeLocked: !!b.limited && s.n >= rangeAt, rangeAt };
}

export interface ChargeView {
  fn: string;
  /** The company's revenue band when it is one of the benchmark's, else null. */
  band: string | null;
  /** Free while billing is live: the function's median only (no range, no client-size figure). */
  limited: boolean;
  /** The figure for this function at this company's revenue band. Null on Free, or when the band isn't known. */
  sized: { monthly: Figure; hourly: Figure } | null;
  /** The function's figure across all client revenue. */
  all: { monthly: Figure; hourly: Figure };
  /** The row the panel leads with: the sized one when it has a monthly or hourly figure, else all revenue. */
  lead: "sized" | "all";
  rangeN: number;
  minN: number;
}

const hasFigure = (f: Figure) => f.state !== "few";

/** What the panel shows for a member's function at a company with this revenue. Null: nothing to show (no function, or no benchmarks yet). */
export function chargeView(b: Benchmarks | undefined, fn: string | null, revenue: string | null): ChargeView | null {
  if (!b || !fn || !FUNCTIONS.includes(fn)) return null;
  const row = (rev: string): BenchmarkRow | undefined => b.rows.find((r) => r.function === fn && r.revenue === rev);
  const allRow = row("All");
  if (!allRow) return null;
  const band = revenue && RN_REVENUE.includes(revenue) ? revenue : null;
  const figs = (r: BenchmarkRow) => ({ monthly: figureOf(r.monthly, b), hourly: figureOf(r.hourly, b) });
  // Free gets no client-size rows from the server; nothing is made up for them here.
  const sizedRow = band && !b.limited ? row(band) : undefined;
  const sized = sizedRow ? figs(sizedRow) : null;
  const all = figs(allRow);
  const lead = sized && (hasFigure(sized.monthly) || hasFigure(sized.hourly)) ? "sized" : "all";
  return { fn, band, limited: !!b.limited, sized, all, lead, rangeN: b.rangeN ?? 10, minN: b.minN };
}

/** The member's own rate, as the panel places it. `at`: the company of the seat it is about, when there is one. */
export interface OwnRate {
  kind: RateKind;
  amount: number;
  at: string | null;
}

/**
 * The member's own rate in this function, one per kind: a rate they shared privately (the newest),
 * else one they put on a seat of theirs. From their own Me and their own seats only.
 */
export function ownRates(
  fn: string,
  benchRates: BenchRate[],
  seats: { company: string; engagementId: string; fn: string | null; rate: string | null; pricing: string | null }[],
): Partial<Record<RateKind, OwnRate>> {
  const out: Partial<Record<RateKind, OwnRate>> = {};
  const seatCo = new Map(seats.map((s) => [s.engagementId, s.company]));
  // Private rates arrive oldest first: the last one of a kind is the newest.
  for (const r of benchRates) if (r.function === fn) out[r.kind] = { kind: r.kind, amount: r.amount, at: r.engagementId ? seatCo.get(r.engagementId) ?? null : null };
  for (const s of seats) {
    if (s.fn !== fn || !s.rate) continue;
    const r = readRate(s.rate, s.pricing);
    if (r && !out[r.kind]) out[r.kind] = { kind: r.kind, amount: r.amount, at: s.company };
  }
  return out;
}

/**
 * Where the member's rate sits in a figure, as a description of what others were paid. Never a
 * figure to quote. Null when the figure has no median.
 */
export function sitsWords(own: number, f: Figure): string | null {
  if (f.state === "few") return null;
  if (f.state === "median") return own === f.median ? "Your rate is at the median." : own < f.median ? "Your rate is under the median." : "Your rate is over the median.";
  if (own < f.p25) return "Your rate is below the middle half of what they were paid.";
  if (own > f.p75) return "Your rate is above the middle half of what they were paid.";
  if (own === f.median) return "Your rate is at the median of what they were paid.";
  return own < f.median ? "Your rate is in the middle half, under the median." : "Your rate is in the middle half, over the median.";
}

/** Whole dollars with separators. Amounts arrive rounded by the server; nothing is rounded again. */
export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
export const per = (k: RateKind) => (k === "hourly" ? "an hour" : "a month");

/** "3 of the 5 people it needs" for a figure below its floor. */
export const fewWords = (f: Extract<Figure, { state: "few" }>) => `${f.n} of the ${f.min} people it needs`;

/** The range picture's axis: a little room either side of the middle half and the member's own rate, on round numbers. */
export function axisOf(f: Extract<Figure, { state: "range" }>, own: number | null, kind: RateKind): { min: number; max: number; ticks: number[] } {
  const lo = Math.min(f.p25, own ?? f.p25);
  const hi = Math.max(f.p75, own ?? f.p75);
  const pad = Math.max((hi - lo) * 0.6, kind === "hourly" ? 20 : 1000);
  const rawStep = (hi - lo + 2 * pad) / 5;
  const steps = kind === "hourly" ? [5, 10, 20, 25, 50, 100, 200, 250, 500] : [250, 500, 1000, 2000, 2500, 5000, 10_000, 20_000, 25_000, 50_000];
  const step = steps.find((s) => s >= rawStep) ?? steps[steps.length - 1];
  const min = Math.max(0, Math.floor((lo - pad) / step) * step);
  const max = Math.ceil((hi + pad) / step) * step;
  const ticks: number[] = [];
  for (let v = min; v <= max + 1e-6; v += step) ticks.push(v);
  return { min, max, ticks };
}
/** "$8k", "$8.5k", "$150". */
export const shortMoney = (n: number) => (n >= 1000 ? `$${(n / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k` : `$${n}`);

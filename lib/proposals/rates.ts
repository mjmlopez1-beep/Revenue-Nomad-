/**
 * Rate suggestions for a proposal: what fractionals in the member's function were paid at
 * companies of this revenue band (the Rate benchmarks' own figures, read the way "What to charge
 * them" reads them: app/post/chargeModel.ts), where the member's price sits in that, and the
 * pricing shape that won (a build, then a lower steady fee; a short first term; an out).
 *
 * It adds no figure of its own and follows the benchmarks' floors: below them it says how many
 * reports a figure still needs, never an amount. The member's own rates are theirs alone.
 * Pure, no React: the editor, the connector and the tests read it.
 */
import type { Benchmarks, View } from "../tableTypes";
import { chargeView, chargeWorking, hoursMonth, hoursOf, money, ownRates, per, sitsWords, type Figure, type OwnRate, type RateKind } from "@/app/post/chargeModel";
import { FUNCTIONS, RN_REVENUE } from "../tableFields";
import { moneyOf, templateDef } from "./library";

export interface RateSuggestion {
  fn: string;
  /** The company's revenue band when it is one of the benchmark's. */
  band: string | null;
  /** The figure is for this band (sized) or every size (all). */
  scope: "sized" | "all";
  kind: RateKind;
  figure: Figure;
  /** The figure in words: "$9,000 – $14,000 a month (the middle half of 14 people)". */
  says: string;
  /** Where the proposal's price sits in it, when both are there. */
  sits: string | null;
  /** The top of the middle half (or the median), for the over-band flag. */
  high: number | null;
  /** The member's own rate in this function, for them alone. */
  own: OwnRate | null;
  /** Free: the median only. */
  limited: boolean;
}

export interface PricingAdvice {
  suggestion: RateSuggestion | null;
  /** The pricing shape that won, in short lines. */
  shape: string[];
  /** What the chosen template's wins looked like, from the library. */
  template: string | null;
  /** Hours a month the fee implies at the member's own hourly rate, when both are known. */
  hoursAtYourRate: number | null;
}

const describe = (f: Figure, kind: RateKind): string =>
  f.state === "range"
    ? `${money(f.p25)} – ${money(f.p75)} ${per(kind)}, the middle half of ${f.n} people (median ${money(f.median)})`
    : f.state === "median"
      ? `a median of ${money(f.median)} ${per(kind)}, from ${f.n} people`
      : `no figure yet: ${f.n} of the ${f.min} reports it needs`;

/** The benchmark for this function and band, and where `price` (a monthly fee) sits in it. Null: no function, or no benchmarks. */
export function rateSuggestion(b: Benchmarks | undefined, fn: string | null, revenue: string | null, price: number | null, own: Partial<Record<RateKind, OwnRate>> = {}): RateSuggestion | null {
  const v = chargeView(b, fn, revenue);
  if (!v) return null;
  const lead = v.lead === "sized" ? v.sized! : v.all;
  const kind: RateKind = lead.monthly.state !== "few" ? "monthly" : lead.hourly.state !== "few" ? "hourly" : "monthly";
  const f = lead[kind];
  const high = f.state === "range" ? f.p75 : f.state === "median" ? f.median : null;
  const sits = price !== null && kind === "monthly" ? sitsWords(price, f)?.replace(/^Your rate/, "Your price") ?? null : null;
  return { fn: v.fn, band: v.band, scope: v.lead, kind, figure: f, says: describe(f, kind), sits, high: kind === "monthly" ? high : null, own: own[kind] ?? own.monthly ?? null, limited: v.limited };
}

/** Everything the investment block's side panel says about pricing. */
export function pricingAdvice(b: Benchmarks | undefined, fn: string | null, revenue: string | null, fields: Record<string, string>, templateId: string | null, own: Partial<Record<RateKind, OwnRate>> = {}): PricingAdvice {
  const price = moneyOf(fields["pricing.monthlyFee"]);
  const suggestion = rateSuggestion(b, fn, revenue, price, own);
  const step = moneyOf(fields["pricing.stepDownFee"]);
  const shape = [
    "Quote one monthly price for the option you recommend, with the days or hours it covers.",
    price !== null && step === null ? `Make months 1 to 3 the build at ${money(price)}, then step down about a third from month 4 (about ${money(Math.round((price * 2) / 3 / 250) * 250)}).` : "Make months 1 to 3 the build at the higher fee, then step down about a third from month 4.",
    "Keep the first term short and firm: 3 to 6 months, then month to month with 30 days' notice.",
    "Offer an out at day 90. It makes yes easier and sets up the renewal decision.",
    "If they push on price, cut days or scope, not the rate.",
  ];
  const hourly = own.hourly?.amount ?? null;
  return { suggestion, shape, template: templateDef(templateId)?.pricingGuidance ?? null, hoursAtYourRate: price !== null && hourly ? Math.round(price / hourly) : null };
}

/**
 * The same from a member's own view (the app's View, or the connector's): their function, the
 * company's revenue band from its record (or the band typed into the proposal), their own rates
 * (shared privately, or on their own seats) for them alone.
 */
export function adviceFromView(
  view: Pick<View, "benchmarks" | "me" | "companies">,
  p: { company: { id: string | null }; fields: Record<string, string>; templateId: string | null },
): PricingAdvice {
  const fn = view.me?.function ?? null;
  return pricingAdvice(view.benchmarks, fn, revenueOf(view, p), p.fields, p.templateId, fn ? ownOfView(view, fn) : {});
}

/** The company's revenue band from its record as the member sees it, else the band typed into the proposal. */
export function revenueOf(view: Pick<View, "companies">, p: { company: { id: string | null }; fields: Record<string, string> }): string | null {
  const rec = p.company.id ? view.companies.find((c) => c.id === p.company.id) : undefined;
  const cell = rec?.cells.revenue;
  return (cell && cell.s === "value" ? String(cell.v) : null) ?? (p.fields["company.revenue"] || null);
}

/** The member's own rates in a function: shared privately, or on their own seats. Theirs alone. */
export function ownOfView(view: Pick<View, "me" | "companies">, fn: string): Partial<Record<RateKind, OwnRate>> {
  const seats = view.companies.flatMap((c) =>
    c.engagements
      .filter((e) => e.yours)
      .map((e) => {
        const r = e.cells.rate;
        const fnCell = e.cells.function;
        const pr = e.cells.pricing;
        return { company: c.hidden ? "one of your seats" : c.name, engagementId: e.id, fn: fnCell?.s === "value" ? String(fnCell.v) : null, rate: r?.s === "value" && r.mine ? String(r.v) : null, pricing: pr?.s === "value" ? String(pr.v) : null };
      }),
  );
  return ownRates(fn, view.me?.benchRates ?? [], seats);
}

/* ---------- a proposal's price: ONE calculation with "What should I charge" ---------- */

/**
 * The price a new proposal opens with, and the math it shows, from the same working as the Rate
 * benchmarks' "What should I charge" (app/post/chargeModel.ts chargeWorking): the member's function,
 * the company's revenue band, the hours the call (or their last proposal) gave. The fee is what the
 * call agreed when it said one, else the member's own monthly rate, else the top of Merlin's ask
 * ("open at the high end"). Hours a month and the hourly figure are the working's own arithmetic
 * (hoursMonth). Nothing here is a figure of its own: no benchmark, no ask.
 */
export interface ProposalRate {
  fn: string | null;
  band: string;
  /** The monthly fee to open with, or null when nothing answers (then the proposal keeps a blank). */
  fee: number | null;
  source: "call" | "yours" | "merlin" | null;
  /** Merlin's ask for this group (the working's amounts), when it answered. */
  ask: { from: number; to: number } | null;
  /** The ask in words ("Ask $9,000 to $11,000 a month"), and the working's steps. */
  big: string | null;
  steps: { t: string; s: string }[];
  hoursWeek: number | null;
  hoursMonth: number | null;
  /** The fee over the hours a month, to the dollar. */
  hourly: number | null;
  /** The shown math, in a line: "2 days a week is about 69 hours a month, so $10,500 is about $152 an hour." */
  math: string;
  /** From month 4, about a third lower (the pricing shape that won), on $250. */
  stepDown: number | null;
}

/** Hours a week said in words ("two days a week", "20 hours a week"), as chargeModel reads them. */
export const hoursWeekOf = (allocation: string | null | undefined): number | null => (allocation ? hoursOf(allocation) : null);

/** The math line for a fee and the hours, the same words everywhere the rate shows. */
export function rateMath(fee: number | null, allocation: string | null | undefined): { hoursWeek: number | null; hoursMonth: number | null; hourly: number | null; math: string } {
  const hw = hoursWeekOf(allocation);
  const hm = hw ? hoursMonth(hw) : null;
  const hourly = fee && hm ? Math.round(fee / hm) : null;
  const math = fee && hm && hourly ? `${String(allocation).trim()} is about ${hm} hours a month, so ${money(fee)} is about ${money(hourly)} an hour.` : fee ? `${money(fee)} a month. Add the days or hours it covers to see it by the hour.` : "No fee yet.";
  return { hoursWeek: hw, hoursMonth: hm, hourly, math };
}

export function proposalRate(
  view: Pick<View, "benchmarks" | "me" | "companies">,
  p: { company: { id: string | null }; fields: Record<string, string>; callFee?: number | null },
): ProposalRate {
  const fn = view.me?.function ?? null;
  const rev = revenueOf(view, p);
  const band = rev && RN_REVENUE.includes(rev) ? rev : "All";
  const allocation = p.fields["pricing.allocation"] || null;
  const hw = hoursWeekOf(allocation);
  const own = fn ? ownOfView(view, fn) : {};
  const w = view.benchmarks && fn && FUNCTIONS.includes(fn) ? chargeWorking(view.benchmarks, { fn, band, kind: "monthly", hours: hw, company: null, industry: false }, own) : null;
  const ask = w?.answered ? w.ask : null;
  const callFee = p.callFee ?? null;
  const fee = callFee ?? own.monthly?.amount ?? ask?.to ?? null;
  const source: ProposalRate["source"] = callFee ? "call" : own.monthly ? "yours" : ask ? "merlin" : null;
  const m = rateMath(fee, allocation);
  return { fn, band, fee, source, ask, big: w?.answered ? w.big : null, steps: w?.steps ?? [], ...m, stepDown: fee ? Math.round((fee * 2) / 3 / 250) * 250 : null };
}

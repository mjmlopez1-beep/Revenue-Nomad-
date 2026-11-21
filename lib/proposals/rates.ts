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
import { chargeView, money, ownRates, per, sitsWords, type Figure, type OwnRate, type RateKind } from "@/app/post/chargeModel";
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
  const me = view.me;
  const fn = me?.function ?? null;
  const rec = p.company.id ? view.companies.find((c) => c.id === p.company.id) : undefined;
  const cell = rec?.cells.revenue;
  const revenue = (cell && cell.s === "value" ? String(cell.v) : null) ?? (p.fields["company.revenue"] || null);
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
  const own = fn ? ownRates(fn, me?.benchRates ?? [], seats) : {};
  return pricingAdvice(view.benchmarks, fn, revenue, p.fields, p.templateId, own);
}

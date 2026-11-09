import rateIndex from "@/data/rate-index.json";

/**
 * Every figure the guide quotes from the research data source, formatted for prose. Chapters read from here
 * (template strings) so the guide, the Rate Index page and the homepage can never disagree. The data file is
 * data/rate-index.json, built by scripts/build-rate-index.mjs from the Google Sheet exports; rebuild it and the
 * guide follows. Rounding per the Methodology: rates to the nearest $5, monthly amounts to the nearest $100.
 */
const d = rateIndex;

export const usd = (n: number | null | undefined) => (n == null ? "n/a" : "$" + Math.round(n).toLocaleString("en-US"));
export const rate = (n: number | null | undefined) => (n == null ? "n/a" : usd(Math.round(n / 5) * 5));
export const monthly = (n: number | null | undefined) => (n == null ? "n/a" : usd(Math.round(n / 100) * 100));
export const k = (n: number | null | undefined) => (n == null ? "n/a" : "$" + (Math.round(n / 100) / 10).toString().replace(/\.0$/, "") + "k");
export const pct = (n: number | null | undefined) => (n == null ? "n/a" : n + "%");
export const of = (x: number, y: number) => `${x} of ${y}`;
export const billions = (n: number) => "$" + (Math.round(n / 1e8) / 10).toFixed(1) + " billion";
export const billionsShort = (n: number) => "$" + (Math.round(n / 1e8) / 10).toFixed(1) + "B";

const asOfDate = new Date(d.asOf + "T00:00:00Z");
export const asOf = {
  iso: d.asOf,
  long: asOfDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }),
  monthYear: asOfDate.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
};

/* The Rate Index: hourly rates as companies pay them. */
const all = d.rates.all;
export const rates = {
  n: all.n,
  median: rate(all.median),
  p25: rate(all.p25),
  p75: rate(all.p75),
  middleHalf: `${rate(all.p25)} - ${rate(all.p75)}`,
  p90: "$500",
  surveyN: d.rates.surveyN,
  platformN: d.rates.platformN,
  topTier: { n: all.topTier.n, floor: usd(all.topTier.floor), max: usd(all.topTier.max), range: `${usd(all.topTier.floor)} - ${usd(all.topTier.max)}` },
  floor: d.rates.publicationFloor,
};

export type CategoryCut = (typeof d.rates.byCategory)[number];
export const byCategory = d.rates.byCategory;
export const category = (name: string) => {
  const c = byCategory.find((x) => x.category === name);
  return { n: c?.n ?? 0, median: rate(c?.median), p25: rate(c?.p25), p75: rate(c?.p75), raw: c?.median ?? null };
};
/** Categories with enough records to publish a median on their own (the index's publication floor). */
export const publishedCategories = byCategory.filter((c) => c.n >= d.rates.publicationFloor && c.median != null);
export const highestCategory = publishedCategories.reduce((a, b) => (b.median! > a.median! ? b : a));
export const lowestCategory = publishedCategories.reduce((a, b) => (b.median! < a.median! ? b : a));

/* Engagements described in the operator survey (first and second client). */
export const engagements = {
  n: d.engagements.n,
  firstClientN: d.engagements.firstClientN,
  medianMonthly: monthly(d.engagements.medianMonthly),
  medianMonthlyRaw: d.engagements.medianMonthly,
  monthlyN: d.engagements.monthlyN,
  byHours: d.engagements.byHours,
  byRevenue: d.engagements.byRevenue,
  monthlyByCategory: d.engagements.monthlyByCategory,
  termShare: d.engagements.termShare,
  extendedShare: d.engagements.extendedShare,
  resultInside60: d.engagements.resultInside60,
  ttrN: d.engagements.ttrN,
};
export const term = (label: string) => d.engagements.termShare.find((t) => t.term === label)?.share ?? 0;

/* Rate and demand movement versus 12 months ago, operator-recalled. */
export const movement = d.movement;

/* The operator survey. */
export const survey = d.survey;
export const role = (name: string) => {
  const r = d.survey.byRole.find((x) => x.category === name);
  if (!r) throw new Error("no survey cut for " + name);
  return r;
};
export const ttr = (band: string) => d.survey.timeToResult.find((t) => t.band === band) ?? { band, n: 0, share: 0 };
export const wish = (key: string) => d.survey.wishChecked.find((w) => w.key === key)?.share ?? 0;
export const plansByAi = (use: "Most" | "Some") => d.survey.plansByAi.find((p) => p.use === use)!;
export const extendedByResult = (band: string) => d.survey.extendedByResult.find((b) => b.band === band) ?? { band, x: 0, y: 0 };
export const extendedByHours = (band: string) => d.survey.extendedByHours.find((b) => b.band === band) ?? { band, x: 0, y: 0 };
export const firstClientRevenue = (band: string) => d.survey.firstClientRevenue.find((b) => b.band === band) ?? { band, n: 0, share: 0 };
export const firstClientMonthly = (band: string) => d.survey.firstClientMonthly.find((b) => b.band === band) ?? { band, n: 0, medianMonthly: null };
/** Share of first-client engagements with $1M to $20M companies, the guide's "center of gravity". */
const shareOfDetailed = (...bands: string[]) => Math.round((bands.reduce((a, b) => a + firstClientRevenue(b).n, 0) / d.survey.detailed) * 100);
export const coreShare = shareOfDetailed("$1M - $5M", "$5M - $20M");
export const smallShare = shareOfDetailed("Pre-revenue", "Under $1M");
export const midShare = shareOfDetailed("$20M - $50M");

/* Platform profiles and the contract books. */
export const platform = d.platform;
export const contracts = d.contracts;
export const seat = (name: string) => d.contracts.bySeat.find((s) => s.seat === name);

/* Market size: the chain in Chapter 1. Operators x annual billings, with the Rate Index median monthly engagement. */
export const market = {
  operatorsLow: 11000,
  operatorsCentral: 14000,
  operatorsHigh: 18000,
  clientsAtOnce: 2.5,
  utilization: 0.75,
  annualPerOperator: Math.round((2.5 * 12 * 0.75 * (d.engagements.medianMonthly ?? 0)) / 5000) * 5000,
};
export const marketSpend = {
  central: billionsShort(market.operatorsCentral * market.annualPerOperator),
  centralLong: billions(market.operatorsCentral * market.annualPerOperator),
  low: billionsShort(market.operatorsLow * market.annualPerOperator),
  high: billionsShort(market.operatorsHigh * market.annualPerOperator),
  range: `${billionsShort(market.operatorsLow * market.annualPerOperator)} to ${billionsShort(market.operatorsHigh * market.annualPerOperator)}`,
  rangeLong: `$${(Math.round((market.operatorsLow * market.annualPerOperator) / 1e8) / 10).toFixed(1)} to ${billions(market.operatorsHigh * market.annualPerOperator)}`,
};

/** Headline counts used on the cover, in Start here and in the Methodology. */
export const headline = {
  operators: "172",
  operatorsNote: "survey, platform and waitlist, deduplicated by email",
  contracts: String(d.contracts.engagements),
  inbound: "77",
  rates: String(all.n),
  survey: d.survey.detailed,
  responses: d.survey.responses,
  profiles: d.platform.usable,
};

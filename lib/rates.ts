/**
 * Reading a free-text rate as a monthly retainer or an hourly rate, for the benchmarks.
 * No imports, so it can be tested on its own.
 */

/**
 * Rate benchmarks' floors: one set for the server's figures (lib/table.ts rateStat, BENCHMARK_*)
 * and for every line a member reads about them (floorWords). Change them here only.
 *   RATE_FLOOR        a group shows a figure (its median) once this many people have a rate in it
 *   RATE_INDEX_FLOOR  a group that includes Rate Index data (our survey and contract data) needs this many
 *   RATE_RANGE_FLOOR  the middle half (low and high) shows at this many
 */
export const RATE_FLOOR = 5;
export const RATE_INDEX_FLOOR = 20;
export const RATE_RANGE_FLOOR = 10;
/** The rule in one sentence, the same wherever it is said. */
export const floorWords = () =>
  `A group shows a figure once ${RATE_FLOOR} people have a rate in it, or ${RATE_INDEX_FLOOR} when it includes Rate Index survey data. Low and high show at ${RATE_RANGE_FLOOR}.`;

/** A number with an optional k/m suffix ("8k", "1.5m"); the suffix can't be the start of a word ("12000 monthly"). */
const NUM = String.raw`(\d+(?:\.\d+)?)\s*(k|m)?(?![a-z])`;
const RANGE = new RegExp(`${NUM}\\s*(?:-|–|—|to)\\s*\\$?\\s*${NUM}`);
const ONE = new RegExp(NUM);

const scale = (v: string, s: string | undefined) => Number(v) * (s === "k" ? 1000 : s === "m" ? 1_000_000 : 1);

/**
 * "$8k/mo" -> monthly 8000, "$150/hr" -> hourly 150, "$8-10k per month" -> monthly 9000,
 * "$120k/yr" -> monthly 10000, "$2k/week" -> monthly ~8667. Project fees, equity and day rates
 * give null. With no unit, the pricing model decides, else the size does (1,000+ is monthly).
 */
export function readRate(raw: string, pricing?: string | null): { kind: "monthly" | "hourly"; amount: number } | null {
  const t = raw.toLowerCase().replace(/,/g, "");
  if (/equity|project|\/\s*day|per day|daily|day rate/.test(t)) return null;
  let amount: number;
  const r = t.match(RANGE);
  if (r) {
    const unit = r[4] ?? r[2];
    amount = (scale(r[1], r[2] ?? unit) + scale(r[3], unit)) / 2;
  } else {
    const m = t.match(ONE);
    if (!m) return null;
    amount = scale(m[1], m[2]);
  }
  let kind: "monthly" | "hourly";
  if (/\/\s*(hr|h|hour)\b|per hour|hourly|an hour/.test(t)) kind = "hourly";
  else if (/\/\s*(mo|month)\b|per month|monthly|a month|retainer/.test(t)) kind = "monthly";
  else if (/\/\s*(wk|week)\b|per week|weekly|a week/.test(t)) (kind = "monthly"), (amount *= 52 / 12);
  else if (/\/\s*(yr|year)\b|per year|annual|a year/.test(t)) (kind = "monthly"), (amount /= 12);
  else if (pricing === "Hourly") kind = "hourly";
  else if (pricing === "Monthly retainer") kind = "monthly";
  else kind = amount >= 1000 ? "monthly" : "hourly";
  if (kind === "hourly" ? amount < 25 || amount > 1500 : amount < 1000 || amount > 150_000) return null;
  return { kind, amount: Math.round(amount) };
}

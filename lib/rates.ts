/**
 * Reading a free-text rate as a monthly retainer or an hourly rate, for the benchmarks.
 * No imports, so it can be tested on its own.
 */

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

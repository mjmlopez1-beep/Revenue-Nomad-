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

/* ---------- a rate a member types ---------- */

/** The forms a rate can be typed in, said wherever one can't be read. */
export const RATE_FORMS = "5000, $5k/mo, 5000/month or $150/hr";
/** A typed rate that can't be read. */
export const RATE_HELP = `We couldn't read that rate. Try ${RATE_FORMS}.`;
/** The same for the benchmarks, which need a monthly or an hourly figure. */
export const BENCH_RATE_HELP = `Use a monthly or hourly rate. These work: ${RATE_FORMS}.`;

/** What the old check took as a rate: a currency sign, a "k", a unit or a pricing word. Words beside one are allowed ("$5k/mo + commission"). */
const SAID_AS_RATE =
  /[$€£]|\d\s*k\b|\/\s*(hr|h|hour|day|wk|week|mo|month|yr|year|project)\b|\bper\b|\b(hourly|daily|weekly|monthly|annual|retainer|project|usd|eur|gbp)\b/i;

export type RateUnit = "hour" | "day" | "week" | "month" | "year" | "project";
const UNITS: [RateUnit, RegExp][] = [
  ["hour", /\/\s*(?:hrs?|h|hours?)\b|\bper\s+hours?\b|\bhourly\b|\b(?:an|a)\s+hour\b|\bph\b|\bhrs?\b|\bhours?\b/],
  ["day", /\/\s*(?:days?|d)\b|\bper\s+day\b|\bdaily\b|\b(?:a)\s+day\b|\bday\s+rate\b/],
  ["week", /\/\s*(?:wks?|weeks?)\b|\bper\s+week\b|\bweekly\b|\b(?:a)\s+week\b/],
  ["month", /\/\s*(?:mos?|mths?|months?|m)\b|\bper\s+month\b|\bmonthly\b|\b(?:a)\s+month\b|\bretainer\b|\bpm\b|\bmos?\b|\bmonths?\b/],
  ["year", /\/\s*(?:yrs?|years?|y)\b|\bper\s+(?:year|annum)\b|\bannual(?:ly)?\b|\b(?:a)\s+year\b|\byrs?\b|\byears?\b/],
  ["project", /\bproject\b|\bfixed\s+fee\b|\bflat\s+fee\b/],
];
/** Words a rate may carry beside its number and unit ("$5,000 USD per month", "5 to 8k a month"). */
const FILLER = /\b(?:usd|eur|gbp|dollars?|euros?|pounds?|per|a|an|to|about|around|approx|approximately|roughly|or|so|retainer|rate|fee|fixed|flat|day|hourly|daily|weekly|monthly|annual|annually|annum|project)\b/g;
const ALL_UNITS = new RegExp(UNITS.map(([, re]) => re.source).join("|"), "g");
const SUFFIX: Record<RateUnit, string> = { hour: "/hr", day: "/day", week: "/wk", month: "/mo", year: "/yr", project: " project" };

/** 5000 -> "5k", 5500 -> "5.5k", 7777 -> "7,777", 150 -> "150": short only when nothing is lost. */
function money(n: number): string {
  const r = Math.round(n * 100) / 100;
  if (r >= 1000 && r % 100 === 0) return `${r / 1000}k`;
  return r.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export type RateParse =
  | { ok: true; value: string; unit: RateUnit; amount: number; high: number | null; read: { kind: "monthly" | "hourly"; amount: number } | null }
  | { ok: false; error: string };

/**
 * One reader for every rate a member types (Add, Your seats, the benchmarks, onboarding, the
 * connector's add_my_seat, the server's own check): 5000, $5,000, 5k, $5k/mo, 5000/month,
 * 150/hr, $150 an hour, "$8-10k per month", "€6,000 per month". `value` is what is kept: the rate as
 * typed when it already reads as one, else the form Merlin read it as ("5000" is "$5k/mo", "150"
 * is "$150/hr": with no unit, the pricing model decides, else the size does, 1,000 and up is
 * monthly). `read` is the benchmarks' reading (readRate), null when the benchmarks can't use it.
 * Anything else (no number, a word that isn't a rate's) is refused with RATE_HELP.
 */
export function parseRate(raw: unknown, pricing?: string | null): RateParse {
  const text = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!text) return { ok: false, error: "Add the rate." };
  const t = text.toLowerCase().replace(/(\d),(?=\d{3}\b)/g, "$1");
  if (!/\d/.test(t)) return { ok: false, error: RATE_HELP };
  const r = t.match(RANGE);
  let amount: number;
  let high: number | null = null;
  if (r) {
    const unit = r[4] ?? r[2];
    amount = scale(r[1], r[2] ?? unit);
    high = scale(r[3], unit);
    if (high < amount) [amount, high] = [high, amount];
  } else {
    const m = t.match(ONE);
    if (!m) return { ok: false, error: RATE_HELP };
    amount = scale(m[1], m[2]);
  }
  if (!(amount > 0) || amount > 10_000_000 || (high !== null && high > 10_000_000)) return { ok: false, error: RATE_HELP };
  const said = UNITS.find(([, re]) => re.test(t))?.[0] ?? null;
  // Words that aren't a rate's ("5000 bananas", "ask me"): not read as one.
  const rest = t
    .replace(new RegExp(RANGE.source, "g"), " ")
    .replace(new RegExp(ONE.source, "g"), " ")
    .replace(/[$€£]/g, " ")
    .replace(ALL_UNITS, " ")
    .replace(FILLER, " ")
    .replace(/[/.\-–+()~:]/g, " ");
  const extra = /\p{L}/u.test(rest);
  if (extra && !SAID_AS_RATE.test(text)) return { ok: false, error: RATE_HELP };
  const unit: RateUnit = said ?? (pricing === "Hourly" ? "hour" : pricing === "Monthly retainer" ? "month" : pricing === "Project fee" ? "project" : amount >= 1000 ? "month" : "hour");
  const sym = (text.match(/[$€£]/) ?? ["$"])[0];
  // Said with its unit: kept as typed. Without one: kept as Merlin read it, so nobody has to guess.
  const value = said ? text : `${sym}${money(amount)}${high !== null ? `-${money(high)}` : ""}${SUFFIX[unit]}`;
  return { ok: true, value: value.slice(0, 60), unit, amount, high, read: readRate(value, pricing) };
}

/**
 * A typed rate for the benchmarks (Your seats, Add, a seat's cell, the rates share, the connector):
 * parseRate first, so every form it takes works here too; then the benchmarks' reading, which needs
 * a monthly or an hourly figure (a project fee or a day rate can't count).
 */
export function benchRead(raw: unknown, pricing?: string | null): { ok: true; kind: "monthly" | "hourly"; amount: number; value: string } | { ok: false; error: string } {
  const p = parseRate(raw, pricing);
  if (!p.ok) return p.error === RATE_HELP ? { ok: false, error: BENCH_RATE_HELP } : p;
  return p.read ? { ok: true, ...p.read, value: p.value } : { ok: false, error: BENCH_RATE_HELP };
}

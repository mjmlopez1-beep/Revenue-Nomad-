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
import { ask as askRules } from "@/lib/ask";

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

/* ---------- the Rate benchmarks page (rates/RatesPage.tsx): a group, its fallback, and "What should I charge" ---------- */

/** "All" or one of RN_REVENUE: the benchmark's client-size bands. */
export type Band = string;

/** "Sales", "Sales, $5M–$20M". */
export const groupLabel = (fn: string, band: Band) => (band === "All" ? fn : `${fn}, ${band}`);
/** "at companies with $5M–$20M revenue", "at pre-revenue companies", "at companies of every size". */
export const bandWho = (band: Band) =>
  band === "All" ? "at companies of every size" : band === "Pre-revenue" ? "at pre-revenue companies" : `at companies with ${band === "Under $1M" ? "under $1M" : band} revenue`;

/** One group as the page reads it: its row's figure for one way of charging, or null when the server sent no row. */
export interface GroupFig {
  fn: string;
  band: Band;
  fig: Figure | null;
}
export interface GroupPick {
  /** The group the member asked for. `fig` null: no row (Free gets none by client size). */
  asked: GroupFig;
  /** On Free, a client-size group is Pro's: the server sends none, so the page shows every size and says so. */
  sizeLocked: boolean;
  /** The figure on show: the group asked for, or the function across every size when it has too few reports. Null: no figure anywhere in the function. */
  shown: GroupFig | null;
  /** The shown group is a wider one than asked ("Not enough reports yet for X, showing Y instead"). */
  widened: boolean;
  /** The nearest group with a middle half (for "What should I charge"), the asked one first. */
  ranged: GroupFig | null;
}

const rowOf = (b: Benchmarks, fn: string, band: Band) => b.rows.find((r) => r.function === fn && r.revenue === band);

/**
 * The group the member picked, and what the page may show for it. Nothing is made up: the asked
 * group's figure when it has one, else the function across every client size (the only wider group
 * the server sends), else none at all with how many people it still needs.
 */
export function pickGroup(b: Benchmarks, fn: string, band: Band, kind: RateKind): GroupPick {
  const at = (bd: Band): GroupFig => {
    const r = rowOf(b, fn, bd);
    return { fn, band: bd, fig: r ? figureOf(r[kind], b) : null };
  };
  const sizeLocked = band !== "All" && !!b.limited;
  const asked = at(band);
  const chain = band === "All" ? [asked] : [asked, at("All")];
  const shown = chain.find((g) => g.fig && g.fig.state !== "few") ?? null;
  const ranged = chain.find((g) => g.fig?.state === "range") ?? null;
  return { asked, sizeLocked, shown, widened: !!shown && shown !== asked, ranged };
}

/** "3 of the 5 people it needs", or for a group with no row on file "No reports yet". */
export const needWords = (g: GroupFig) => (g.fig && g.fig.state === "few" ? fewWords(g.fig) : g.fig ? "" : "No reports yet");

/** Where an amount sits in a figure, as words about what others were paid (no "Your rate is"). Null: the figure has no median. */
export function sitsShort(own: number, f: Figure | null): string | null {
  if (!f) return null;
  const w = sitsWords(own, f);
  return w ? w.replace(/^Your rate is /, "") : null;
}

/* ---------- "What should I charge": the words of an ask, then the steps of the working ---------- */

/** What an ask asks about. Everything is read from the words; nothing is guessed. */
export interface ChargeAsk {
  fn: string | null;
  band: Band;
  kind: RateKind;
  /** Hours a week, when the words said ("2 days a week" is 16). */
  hours: number | null;
  /** A company the member can see, named in the words (its revenue sets the band). */
  company: string | null;
  /** An industry the words named: the benchmarks have no industry groups, so the working says it was left out. */
  industry: boolean;
}

/** "2 days a week" 16, "20 hours a week" 20, "half time" 20, "full time" 40. Null when the words say no hours. */
export function hoursOf(text: string): number | null {
  const t = text.toLowerCase().replace(/,/g, "");
  const days = /(\d+(?:\.\d+)?|one|two|three|four|five|half a)\s*days?\s*(?:a|per|each|\/)\s*week/.exec(t);
  if (days) {
    const w: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, "half a": 0.5 };
    const n = w[days[1]] ?? Number(days[1]);
    if (n > 0 && n <= 5) return Math.round(n * 8);
  }
  const hrs = /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*(?:a|per|each|\/)?\s*(?:week|wk)\b/.exec(t) ?? /(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)\b/.exec(t);
  if (hrs) {
    const n = Number(hrs[1]);
    if (n > 0 && n <= 60) return Math.round(n);
  }
  if (/\bhalf[- ]time\b/.test(t)) return 20;
  if (/\bfull[- ]time\b/.test(t)) return 40;
  return null;
}

/** The words ask for hourly figures. */
export const hourlyAsked = (text: string) => /\b(by the hour|per hour|an hour|hourly|\/\s*hr|hour rate)\b/i.test(text);

/**
 * The steps of Merlin's working, each from a figure the page shows: the group and its people, what
 * they were paid, the check by the hour when hours were given (the hourly median times the hours,
 * rounded as the server rounds), the member's own rate placed in it, and what to ask. `result`
 * null when there is nothing to answer from: Merlin says so and never guesses.
 */
export interface Working {
  steps: { t: string; s: string }[];
  /** "Ask $9,000 to $11,000 a month", or "Start at $9,000 a month". */
  big: string;
  sub: string;
  /** "Where this lands": the benchmark above is set to this group. */
  lands: string;
  /** The range Merlin suggests, for the chart: median to the top of the middle half. */
  band: { from: number; to: number } | null;
  answered: boolean;
}

const people = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "person" : "people"}`;
/** Hours a week to hours a month, as the server reads hours on a seat (52 weeks over 12 months). */
export const hoursMonth = (hoursWeek: number) => Math.round((hoursWeek * 52) / 12);

export function chargeWorking(b: Benchmarks, a: ChargeAsk & { fn: string }, own: Partial<Record<RateKind, OwnRate>>): Working {
  const g = pickGroup(b, a.fn, a.band, a.kind);
  const steps: Working["steps"] = [];
  const add = (t: string, s: string) => steps.push({ t, s });
  const per0 = per(a.kind);
  const askedN = g.asked.fig ? g.asked.fig.n : 0;
  let groupS = `${groupLabel(a.fn, a.band)}: ${people(askedN)}, each counted once.`;
  if (a.company) groupS = `${a.company} is ${a.band === "All" ? "of unknown size" : a.band}. ${groupS}`;
  if (g.sizeLocked) groupS = `${groupLabel(a.fn, "All")}: client size is Pro, so Merlin used every company size.`;
  else if (g.widened && g.shown) groupS += ` That is under the ${g.asked.fig?.state === "few" ? g.asked.fig.min : b.minN} it needs, so Merlin widened to ${groupLabel(g.shown.fn, g.shown.band)}: ${people(g.shown.fig!.n)}.`;
  if (a.industry) groupS += " The benchmarks have no industry groups yet, so every industry counts.";
  add("The group", groupS);
  if (!g.shown || !g.shown.fig || g.shown.fig.state === "few") {
    add("What they were paid", `No figure in ${a.fn} yet. A group shows one at ${b.minN} people.`);
    return { steps, big: "Merlin cannot answer from the numbers yet", sub: "It will not guess. Share your own rate privately, and ask two peers to do the same.", lands: "the benchmark above is set to this group, and shows how many people it still needs.", band: null, answered: false };
  }
  const f = g.shown.fig;
  const rf = g.ranged?.fig?.state === "range" ? g.ranged.fig : null;
  if (f.state === "range") add("What they were paid", `${money(f.p25)} to ${money(f.p75)} ${per0}. The middle is ${money(f.median)}.`);
  else
    add(
      "What they were paid",
      `A median of ${money(f.median)} ${per0}. ${f.rangeLocked ? "The middle half is Pro." : `No middle half under ${b.rangeN ?? 10} people.`}`,
    );
  // The check by the hour: the hourly median for the same group times the hours a month. Arithmetic on a figure shown here, rounded as the server rounds.
  if (a.kind === "monthly" && a.hours) {
    const h = pickGroup(b, a.fn, g.shown.band, "hourly").shown;
    if (h?.fig && h.fig.state !== "few") {
      const hm = hoursMonth(a.hours);
      add("Checked by the hour", `${a.hours} hours a week is about ${hm} hours a month. At the hourly median of ${money(h.fig.median)} that is ${money(Math.round((hm * h.fig.median) / 250) * 250)} a month.`);
    } else add("Checked by the hour", `${a.hours} hours a week. There is no hourly figure for this group yet to check against.`);
  }
  const mine = own[a.kind];
  const base = rf ?? f;
  add("Your own rate", mine ? `${money(mine.amount)} ${per0}${mine.at ? ` at ${mine.at}` : ""}: ${sitsShort(mine.amount, base) ?? "no figure to compare yet."}` : "You have not added one yet. Add a rate and Merlin places it. Only you see it.");
  const lands = `the benchmark above is set to ${groupLabel(g.shown.fn, g.shown.band)}`;
  if (rf) {
    add("What to ask", `From the middle (${money(rf.median)}) to the top of the middle half (${money(rf.p75)}): 1 in 4 people in ${groupLabel(g.ranged!.fn, g.ranged!.band)} were paid more than that.`);
    return {
      steps,
      big: `Ask ${money(rf.median)} to ${money(rf.p75)} ${per0}`,
      sub: a.kind === "hourly" ? "Open at the high end. Keep the middle as your floor. Quote a set number of hours, so the total is clear." : "Open at the high end. Keep the middle as your floor.",
      lands: `${lands}, with Merlin's range marked on the chart.`,
      band: g.ranged === g.shown ? { from: rf.median, to: rf.p75 } : null,
      answered: true,
    };
  }
  add("What to ask", `Only a median here, so Merlin stays at the middle.`);
  return {
    steps,
    big: `Start at ${money(f.median)} ${per0}`,
    sub: f.state === "median" && f.rangeLocked ? "That is the middle for this group. Pro adds the middle half, so Merlin can show how far above it to ask." : `That is the middle for this group. Merlin can say more once ${b.rangeN ?? 10} people have a rate in it.`,
    lands: `${lands}.`,
    band: null,
    answered: true,
  };
}

/**
 * The words of an ask, read by Ask Merlin's rules (lib/ask.ts) for the function and the client's
 * revenue, plus the hours and "by the hour" here. A company counts only when the member can see it
 * and the words name it in full; its revenue on file sets the band. Words the rules did not know
 * come back in `unknown`, never guessed at.
 */
export function readChargeAsk(text: string, o: { myFn: string | null; companies?: { name: string; revenue: string | null }[] }): ChargeAsk & { unknown: string[] } {
  const low = text.toLowerCase();
  // The longest name a word-for-word match, so "Cedar and Pine" wins over "Cedar".
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const co = (o.companies ?? [])
    .filter((c) => c.name.length >= 3 && new RegExp(`(^|[^a-z0-9])${esc(c.name.toLowerCase())}($|[^a-z0-9])`).test(low))
    .sort((x, y) => y.name.length - x.name.length)[0];
  let rest = co ? text.replace(new RegExp(esc(co.name), "i"), " ") : text;
  // Hours and "by the hour" are read here: take them out before the rules read the rest.
  rest = rest
    .replace(/(\d+(?:\.\d+)?|one|two|three|four|five|half a)\s*days?\s*(?:a|per|each|\/)\s*week/gi, " ")
    .replace(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|h)\s*(?:a|per|each|\/)?\s*(?:week|wk)?\b/gi, " ")
    .replace(/\b(by the hour|per hour|an hour|hourly|half[- ]time|full[- ]time|renewal|retainer|monthly|a month|per month|my function|any client|what should i charge|what to charge|how much)\b/gi, " ");
  const p = askRules(rest, { myFn: o.myFn });
  const fn = p.filters.fn?.find((f) => FUNCTIONS.includes(f)) ?? (o.myFn && FUNCTIONS.includes(o.myFn) ? o.myFn : null);
  const coBand = co?.revenue && RN_REVENUE.includes(co.revenue) ? co.revenue : null;
  const band = coBand ?? p.filters.revenue?.find((r) => RN_REVENUE.includes(r)) ?? "All";
  return {
    fn,
    band,
    kind: hourlyAsked(text) ? "hourly" : "monthly",
    hours: hoursOf(text),
    company: co?.name ?? null,
    industry: !!p.filters.industry?.length,
    unknown: p.unknown,
  };
}

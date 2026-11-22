/**
 * Do a proposal's numbers agree with each other? Plain rules over the text as the client reads it
 * (each section with its fields filled), run after every change Merlin makes (lib/proposals/change.ts)
 * and shown with it ("Checked: $24,000 + 6 months × $11,000 = $90,000").
 *
 *  - Money: fixed fees ("$24,000 fixed", "a one-time fee of $8k"), monthly fees ("$11,000 a month"),
 *    and totals ("$90,000 in total"). A total must be the fixed fees plus a monthly fee times the
 *    months it runs, for the months the proposal states.
 *  - The term: every "N months" or "N-month" term said in the pricing and term sections is the
 *    same number, or the sections say which phase each belongs to.
 *  - Days: an opt-in or decision day ("opt in by day 45") is the same day wherever it is said.
 *
 * Pure, no imports: the app and the server read the same check.
 */

export interface NumberCheck {
  ok: boolean;
  /** One line to show: what was checked, or what doesn't agree. */
  line: string;
  problems: string[];
}

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, eighteen: 18, "twenty-four": 24 };
const num = (s: string) => (WORD_NUM[s.toLowerCase()] ?? Number(s.replace(/,/g, "")));
/** "$24k", "$24,000", "24,000 dollars": in dollars. */
export function dollars(raw: string): number | null {
  const m = raw.replace(/\s+/g, "").match(/^\$?(\d[\d,]*(?:\.\d+)?)(k|m)?$/i);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * (m[2]?.toLowerCase() === "k" ? 1000 : m[2]?.toLowerCase() === "m" ? 1_000_000 : 1));
}
export const money = (n: number) => `$${n.toLocaleString("en-US")}`;

const MONEY = /\$\s?\d[\d,]*(?:\.\d+)?\s?[kKmM]?\b/g;
const MONTHLY_AFTER = /^\s*(?:\/\s*mo(?:nth)?\b|(?:a|per|each)\s+month\b|monthly\b|\s*a\s+mo\b)/i;
const MONTHLY_BEFORE = /(monthly|per month|a month|retainer of|monthly fee of)\s*(?:of\s*)?$/i;
const FIXED_NEAR = /\b(fixed|flat|one[- ]time|one[- ]off|up front|upfront|for the assessment|assessment fee|project fee)\b/i;
const TOTAL_NEAR = /\b(total|in all|altogether|all in|overall|combined|comes to|in total)\b/i;
const MONTHS = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|eighteen|twenty-four)[- ]months?\b/gi;
const DAY_N = /\bday\s+(\d{1,3})\b/gi;
const OPT = /\b(opt[- ]?in|opts in|decide|decision|go\/no-go|continue)\b/i;

/** Check the numbers across sections. `sections`: each section's title and text as the client reads it. */
export function checkNumbers(sections: { title: string; text: string }[]): NumberCheck {
  const fixed: { n: number; at: string }[] = [];
  const monthly: { n: number; at: string }[] = [];
  const totals: { n: number; at: string }[] = [];
  const terms: { n: number; at: string }[] = [];
  const optDays: { n: number; at: string }[] = [];
  for (const s of sections) {
    for (const line of s.text.split(/\n|(?<=[.;])\s+/)) {
      for (const m of line.matchAll(MONEY)) {
        const n = dollars(m[0]);
        if (!n || n < 100) continue;
        const after = line.slice(m.index! + m[0].length, m.index! + m[0].length + 24);
        const before = line.slice(Math.max(0, m.index! - 40), m.index!);
        const near = line.slice(Math.max(0, m.index! - 40), m.index! + m[0].length + 30);
        if (MONTHLY_AFTER.test(after) || MONTHLY_BEFORE.test(before)) monthly.push({ n, at: s.title });
        else if (TOTAL_NEAR.test(near)) totals.push({ n, at: s.title });
        else if (FIXED_NEAR.test(near)) fixed.push({ n, at: s.title });
      }
      if (/\b(term|months?|phase|retainer|engagement|billed|initial)\b/i.test(line))
        for (const m of line.matchAll(MONTHS)) {
          const ctx = line.slice(Math.max(0, m.index! - 30), m.index! + m[0].length + 30);
          if (/\b(notice|after month|from month|in month|months? (?:1|one) to|ago|last|past)\b/i.test(ctx)) continue;
          terms.push({ n: num(m[1]), at: s.title });
        }
      if (OPT.test(line)) for (const m of line.matchAll(DAY_N)) optDays.push({ n: Number(m[1]), at: s.title });
    }
  }
  const problems: string[] = [];
  const termSet = [...new Set(terms.map((t) => t.n))];
  const daySet = [...new Set(optDays.map((d) => d.n))];
  if (daySet.length > 1) problems.push(`The opt-in day reads ${daySet.map((d) => `day ${d}`).join(" and ")} in different places.`);
  const sumFixed = [...new Set(fixed.map((f) => f.n))].reduce((a, b) => a + b, 0);
  const mo = monthly[0]?.n ?? null;
  // The months the monthly fee runs: the one term said, else the one said beside the fee.
  const near = [...new Set(terms.filter((t) => t.at === monthly[0]?.at).map((t) => t.n))];
  const months = termSet.length === 1 ? termSet[0] : near.length === 1 ? near[0] : null;
  let equation = "";
  if (mo && months) {
    const total = sumFixed + mo * months;
    equation = `${sumFixed ? `${money(sumFixed)} + ` : ""}${months} months × ${money(mo)} = ${money(total)}`;
    for (const t of totals) if (t.n !== total && t.n !== mo * months && t.n !== sumFixed) problems.push(`${t.at} says ${money(t.n)} in total, but ${equation}.`);
  }
  if (termSet.length > 1 && !sections.some((s) => /\bphase\b/i.test(s.text))) problems.push(`The term reads ${termSet.map((n) => `${n} months`).join(" and ")} in different sections.`);
  const places = new Set([...terms, ...optDays].map((x) => x.at)).size;
  if (problems.length) return { ok: false, line: `Check before you accept: ${problems[0]}`, problems };
  const bits = [equation ? `Checked: ${equation}.` : sumFixed || mo ? `Checked: the fees read ${[sumFixed ? `${money(sumFixed)} fixed` : "", mo ? `${money(mo)} a month` : ""].filter(Boolean).join(" and ")}.` : "Checked: no prices to add up."];
  if (places > 1) bits.push(`The term${daySet.length ? " and the opt-in date" : ""} match in all ${places === 2 ? "both" : places} places.`);
  else if (termSet.length === 1 && terms.length > 1) bits.push("The term matches wherever it's said.");
  return { ok: true, line: bits.join(" ").replace(" in all both places", " in both places"), problems };
}

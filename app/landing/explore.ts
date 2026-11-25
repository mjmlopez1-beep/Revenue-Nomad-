/**
 * The words of the landing page's Explore answer (Finder.tsx), pure so they can be checked
 * without a browser (scripts/test-explore.mts).
 *
 * The three tabs are three populations from lib/preview.ts, counted by company, for one function
 * within the picked industry and country (owner review M3):
 *   all      "CTO seat or role": companies with a seat or an open role in this function on file
 *   hiring   "Hiring now": the part of the first with an open role in this function now
 *   notyet   "No fractional CTO yet": other companies, that hired fractionals in other functions and
 *            none in this one (never in the first)
 * The first and the third don't overlap and the second sits inside the first, so no tab is a total
 * of the others: the page shows no "All" and no sum, and the line under the tabs says how they relate.
 */

/** How a fractional in each function is usually called, for "have hired a fractional CMO". */
const SEAT_NOUN: Record<string, string> = {
  Sales: "sales leader",
  Marketing: "CMO",
  RevOps: "RevOps lead",
  "Customer Success": "customer success leader",
  Partnerships: "partnerships lead",
  Growth: "growth lead",
  "Product Marketing": "product marketing lead",
  Enablement: "enablement lead",
  "AI GTM": "AI GTM lead",
  Technology: "CTO",
  Finance: "CFO",
  Operations: "COO",
  People: "people leader",
  Product: "product leader",
  Legal: "general counsel",
  Executive: "executive",
};
export const seatNoun = (fn: string) => SEAT_NOUN[fn] ?? `${fn} lead`;

export type ExploreView = "all" | "hiring" | "notyet";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const fmt = (n: number) => n.toLocaleString("en-US");

/** A tab's name: the population it counts, never "All". */
export const viewLabel = (v: ExploreView, fn: string) => (v === "all" ? `${cap(seatNoun(fn))} seat or role` : v === "hiring" ? "Hiring now" : `No fractional ${seatNoun(fn)} yet`);

/** "Technology, any industry, any country": the scope every count on the tabs is within. */
export const scopeLine = (fn: string, industry: string | null, country: string | null) => `${fn}, ${industry || "any industry"}, ${country || "any country"}`;

/**
 * The line under the tabs: what each count holds and how they relate, in the scope picked.
 * "In Technology, any industry, any country: 2,123 companies have a CTO seat or role on file, 41 of
 * them hiring now. 17,301 other companies hired fractionals in other functions and no CTO yet."
 */
export function populationLine(c: { all?: number; hiring: number; notYet: number }, fn: string, industry: string | null, country: string | null): string {
  const noun = seatNoun(fn);
  const all = c.all ?? 0;
  const co = (n: number) => (n === 1 ? "company" : "companies");
  const first = `${fmt(all)} ${co(all)} ${all === 1 ? "has" : "have"} a ${noun} seat or role on file${all ? `, ${fmt(c.hiring)} of them hiring now` : ""}.`;
  const third = c.notYet ? ` ${fmt(c.notYet)} other ${co(c.notYet)} hired fractionals in other functions and no ${noun} yet.` : "";
  return `In ${scopeLine(fn, industry, country)}: ${first}${third}`;
}

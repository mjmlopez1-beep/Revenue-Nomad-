/**
 * Onboarding's pure parts, kept apart from the component so scripts/test-onboard.mts can check
 * them without a browser: the title suggestions, what a client card on Find your seats says about
 * the seats on file, and the saved view of open roles that "Also show open <function> roles" adds
 * beside the first view (the first view itself is in ./firstView.ts).
 */
import type { Cell, CompanyRec, EngagementRec, Icp } from "@/lib/tableTypes";
import { EMPTY_FILTERS, criteriaOf, icpEmpty, isUnheldOpenRole, viewName, withIcpSpelled, type Filters } from "@/app/post/model";
import { onboardingPlace } from "./place";

/** A cell's value when the viewer can see it. */
const val = (c: Cell | undefined) => (c && c.s === "value" ? c.v : null);

/** Functions that read naturally in "no Sales seat yet". The catch-alls do not. */
export const named = (fn: string | null) => (fn && fn !== "Other" && fn !== "Executive" ? fn : null);

/** Titles fractionals in each function go by, offered as one tap under an empty title. */
const TITLES: Record<string, string[]> = {
  Sales: ["Fractional VP Sales", "Fractional CRO"],
  Marketing: ["Fractional CMO", "Fractional VP Marketing"],
  RevOps: ["Fractional Head of RevOps", "Fractional VP RevOps"],
  "Customer Success": ["Fractional VP Customer Success"],
  Partnerships: ["Fractional VP Partnerships"],
  Growth: ["Fractional Head of Growth"],
  "Product Marketing": ["Fractional Head of Product Marketing"],
  Enablement: ["Fractional Head of Enablement"],
  "AI GTM": ["Fractional AI GTM Lead"],
  Technology: ["Fractional CTO"],
  Finance: ["Fractional CFO"],
  Operations: ["Fractional COO"],
  People: ["Fractional CHRO"],
  Product: ["Fractional CPO"],
  Legal: ["Fractional General Counsel"],
  Executive: ["Fractional CEO", "Fractional COO"],
};
export const titlesFor = (fn: string | null): string[] => (fn && TITLES[fn]) || [];
/** Accounts that joined before titles started empty were given the word "Member": that is no title. */
export const realTitle = (t: string | null | undefined) => (t && t.trim() !== "Member" ? t : "");

/**
 * One line about a company that works for sparse and rich records: industry, size, and the
 * seats on file with how recent they are ("1 recent seat", "3 seats, 2 recent", "2 past seats").
 */
export function metaOf(c: CompanyRec): string {
  const parts = [val(c.cells.industry), val(c.cells.employees)].filter(Boolean) as string[];
  const n = c.engagements.length;
  const f = c.friendly;
  if (n === 1) parts.push(f.recent > 0 ? "1 recent seat" : f.fractional > 0 ? "1 past seat" : "1 seat");
  else if (n > 1) parts.push(f.recent > 0 ? `${n} seats, ${Math.min(n, f.recent)} recent` : f.fractional > 0 ? `${n} past seats` : `${n} seats`);
  return parts.join(" · ");
}

/** A seat whose holder is on file (behind a lock or not), in the function given if any. */
const holderOnFile = (e: EngagementRec, fn: string | null) => !!e.cells.operator && e.cells.operator.s !== "empty" && (!fn || val(e.cells.function) === fn);

/* ---------- Find your seats: what a client card says ---------- */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One seat as a line: its role or function, then when ("VP Sales, Mar 2023 to Jan 2024"). */
export function seatLine(e: EngagementRec, month: (iso: string) => string = (x) => x): string {
  const what = val(e.cells.role) || val(e.cells.function) || "A fractional seat";
  const start = val(e.cells.start);
  const end = val(e.cells.end);
  const when = start ? (end && end !== "Ongoing" ? `${month(start)} to ${month(end)}` : `from ${month(start)}`) : "";
  return [what, when].filter(Boolean).join(", ");
}

/** Where a seat on file that the member can't claim stands: what the card says beside it. */
export function seatState(e: EngagementRec): string {
  if (isUnheldOpenRole(e)) return "Open role";
  if (holderOnFile(e, null)) return "A seat holder is on file";
  return "No seat holder on file";
}

/**
 * The seats on file at a client the member typed, as the card shows them. `claim`: seats they
 * can claim (or already hold), their function first. `others`: every other seat there, with
 * its function, their function first, so a card never says "no seat" while one is on file.
 * `note`: the one line above the add button, true to what is on file.
 */
export function seatsAt(c: CompanyRec | null | undefined, fn: string | null): { claim: EngagementRec[]; others: EngagementRec[]; note: string | null } {
  if (!c || !c.engagements.length) return { claim: [], others: [], note: "We don't have a seat on file there yet." };
  const fnFirst = (a: EngagementRec, b: EngagementRec) => Number(val(b.cells.function) === fn) - Number(val(a.cells.function) === fn);
  const claimAll = c.engagements.filter((e) => e.claimable || e.yours).sort(fnFirst);
  const inFnClaim = fn ? claimAll.filter((e) => e.yours || val(e.cells.function) === fn) : claimAll;
  const claim = (inFnClaim.length ? inFnClaim : claimAll).slice(0, 3);
  const others = c.engagements.filter((e) => !e.claimable && !e.yours).sort(fnFirst).slice(0, 4);
  const total = c.engagements.filter((e) => !e.claimable && !e.yours).length;
  if (claim.some((e) => e.yours)) return { claim, others: [], note: null };
  if (claim.length) return { claim, others: [], note: null };
  const nfn = named(fn);
  const inFn = nfn ? c.engagements.filter((e) => !e.claimable && !e.yours && val(e.cells.function) === nfn).length : 0;
  const fnsThere = [...new Set(c.engagements.map((e) => val(e.cells.function)).filter((x): x is string => !!x))];
  let note: string;
  if (inFn) note = `${plural(inFn, `${nfn} seat`)} on file here ${inFn === 1 ? "is" : "are"} under someone else. Held a different one? Add it.`;
  else if (nfn) note = `No ${nfn} seat on file here yet. ${total === 1 ? "There is 1 seat" : `There are ${total} seats`} in ${fnsThere.length ? fnsThere.join(", ") : "other functions"}. Add yours if you held one.`;
  else note = `${plural(total, "seat")} on file here, under someone else. Held a different one? Add it.`;
  return { claim, others, note };
}

/* ---------- the open roles view, beside the first view ---------- */

/**
 * The saved view "Also show open Sales roles" adds beside the first view: Hiring now in their
 * function, with the Ideal Fractional Profile pill on (onboardingPlace in place.ts). Only the
 * function is a hard filter, so a company whose size or country isn't on file stays in, as the
 * pill keeps it. The name and the weekly email's criteria spell the profile out.
 */
export function alertView(fn: string | null, icp: Icp | null): { name: string; place: string; criteria: ReturnType<typeof criteriaOf> } {
  const pill: Filters = { ...EMPTY_FILTERS, fn: named(fn) ? [fn!] : [], icp: !icpEmpty(icp) };
  const spelled = withIcpSpelled(pill, icp);
  return { name: viewName(spelled, "hiring", "engagements"), place: onboardingPlace(fn, icpEmpty(icp) ? null : icp), criteria: criteriaOf(spelled, null) };
}

/** A view onboarding saved before the pill (the profile spelled out, so it opened empty): its place now (place.ts). */
export { pillPlace } from "./place";

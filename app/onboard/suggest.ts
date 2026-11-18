/**
 * Onboarding's pure parts, kept apart from the component so scripts/test-onboard.mts can check
 * them without a browser: the suggestions on Follow companies and their heading, what a client
 * card on Find your seats says about the seats on file, the title suggestions, and the saved
 * view behind the weekly email offered at the end.
 */
import type { Cell, CompanyRec, EngagementRec, GOALS, Icp } from "@/lib/tableTypes";
import { EMPTY_FILTERS, bestFit, criteriaOf, deriveAll, icpEmpty, icpTest, isFirm, isUnheldOpenRole, viewName, withIcpSpelled, type Filters } from "@/app/post/model";
import { onboardingPlace } from "./place";

/** A cell's value when the viewer can see it. */
const val = (c: Cell | undefined) => (c && c.s === "value" ? c.v : null);

export type Goal = (typeof GOALS)[number]["key"];

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

/** The member held a seat here (the seat on file carries their name). */
export const isMine = (c: CompanyRec) => c.engagements.some((e) => e.yours);
/**
 * Every function on file at a company: the ones it hired fractionally, then the ones with an
 * open role and no hire yet (friendly.hiring). "Hired in other functions" reads hires alone.
 */
export const fnsOf = (c: CompanyRec) => [...c.friendly.functions, ...(c.friendly.hiring ?? []).filter((f) => !c.friendly.functions.includes(f))];
/**
 * The functions a company card shows: the ones above, then the function of every other seat on
 * file (a full-time Growth seat, say): the same functions its rows show in the table.
 */
export const seatFns = (c: CompanyRec) => {
  const out = fnsOf(c);
  for (const e of c.engagements) {
    const f = val(e.cells.function);
    if (f && !out.includes(f)) out.push(f);
  }
  return out;
};
/** A seat whose holder is on file (behind a lock or not), in the function given if any. */
const holderOnFile = (e: EngagementRec, fn: string | null) => !!e.cells.operator && e.cells.operator.s !== "empty" && (!fn || val(e.cells.function) === fn);

export const SUGGESTIONS = 6;

/**
 * How strong the evidence is that a company hires fractionals, for sorting: an open role
 * now, a fractional seat that started recently, or one on file from before.
 */
function fitRank(c: CompanyRec): number {
  const f = c.friendly;
  return f.open > 0 ? 3 : f.recent > 0 ? 2 : f.fractional > 0 ? 1 : 0;
}

/** A phrase that reads after "Fit your Ideal Fractional Profile, " also heads a list on its own. */
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/**
 * Six suggestions, and a heading that says exactly how they were picked. The goal decides what
 * a company must have (no seat in their function yet, a seat holder on file in it, a hire in
 * it, repeat hires) and the Ideal Fractional Profile narrows that. When the strictest list is
 * short it is topped up from the next one, and the heading says so ("then more").
 */
export function suggest(all: CompanyRec[], goal: Goal | null, fn: string | null, icp: Icp | null = null, clients: string[] = []): { title: string; list: CompanyRec[] } {
  // Hidden companies (an open role, not yet unlocked) have no name to follow by. Fractional firms
  // are not clients, and the member's own clients are their seats, not companies to follow.
  const theirs = new Set(clients);
  const companies = all.filter((c) => !c.hidden && !isFirm(c) && !isMine(c) && !theirs.has(c.id));
  const nfn = named(fn);
  const profile = !icpEmpty(icp);
  const rank = new Map(companies.map((c) => [c.id, fitRank(c)]));
  // Many companies tie on score, so recent evidence breaks the tie before name order does.
  const byScore = (a: CompanyRec, b: CompanyRec) =>
    b.friendly.score - a.friendly.score ||
    (rank.get(b.id) ?? 0) - (rank.get(a.id) ?? 0) ||
    b.engagements.length - a.engagements.length ||
    Number(!!b.iconDomain) - Number(!!a.iconDomain) ||
    a.name.localeCompare(b.name);
  let order = byScore;
  if (profile) {
    // Confirmed matches of their profile before maybes (a part not on file), then best fit for their function.
    const me = { icp, function: fn };
    const score = new Map(
      deriveAll(companies).map((i) => {
        const b = bestFit(i, me);
        return [i.c.id, b.score + (b.match === "match" ? 2000 : b.match === "maybe" ? 1000 : 0)];
      }),
    );
    order = (a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) || byScore(a, b);
  }
  const fits = profile ? icpTest(icp!) : () => true;

  // What the goal asks of a company, and the words for it.
  let want: ((c: CompanyRec) => boolean) | null = null;
  let what = "";
  if (goal === "adjacent") {
    want = (c) => c.friendly.functions.length > 0 && (!fn || !c.friendly.functions.includes(fn));
    what = nfn ? `with no fractional ${nfn} yet` : "that hired fractionals in other functions";
  } else if (goal === "intro") {
    want = (c) => c.engagements.some((e) => holderOnFile(e, nfn));
    what = nfn ? `with a ${nfn} seat holder on file` : "with a seat holder on file";
  } else if (goal === "friendly") {
    want = (c) => c.friendly.fractional > 1;
    what = "that hired fractionals more than once";
  } else if (nfn) {
    want = (c) => fnsOf(c).includes(nfn);
    what = `that hired or are hiring a fractional in ${nfn}`;
  }

  // Strictest first. The profile is never dropped before the goal is.
  const tiers: { test: (c: CompanyRec) => boolean; title: string }[] = [];
  if (profile && want) tiers.push({ test: (c) => fits(c) && want!(c), title: `Fit your Ideal Fractional Profile, ${what}` });
  if (profile) tiers.push({ test: fits, title: "Fit your Ideal Fractional Profile" });
  if (want) tiers.push({ test: want, title: cap(what) });
  tiers.push({ test: () => true, title: "Companies that hire fractionals" });

  /** Companies with no seats or functions on file say little: they only fill the six. */
  const withFunctions = (list: CompanyRec[]) => [...list.filter((c) => seatFns(c).length > 0), ...list.filter((c) => !seatFns(c).length)];
  /** Several industries picked: take turns between them, so one industry doesn't fill all six. */
  const spread = (list: CompanyRec[]) => {
    const inds = profile ? icp!.industries : [];
    if (inds.length < 2) return list;
    const buckets = inds.map((ind) => list.filter((c) => val(c.cells.industry) === ind));
    const out: CompanyRec[] = [];
    const seen = new Set<string>();
    for (let i = 0; out.length < SUGGESTIONS && buckets.some((b) => b.length > i); i++)
      for (const b of buckets)
        if (b[i] && !seen.has(b[i].id) && out.length < SUGGESTIONS) {
          out.push(b[i]);
          seen.add(b[i].id);
        }
    return [...out, ...list.filter((c) => !seen.has(c.id))];
  };

  const list: CompanyRec[] = [];
  const taken = new Set<string>();
  let title = "";
  let topped = false;
  for (const t of tiers) {
    if (list.length >= SUGGESTIONS) break;
    const add = spread(withFunctions(companies.filter((c) => !taken.has(c.id) && t.test(c)).sort(order)));
    if (!add.length) continue;
    if (!title) title = t.title;
    else topped = true;
    for (const c of add.slice(0, SUGGESTIONS - list.length)) {
      list.push(c);
      taken.add(c.id);
    }
  }
  return { title: !title ? "Companies that hire fractionals" : topped ? `${title}, then more` : title, list };
}

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

/* ---------- the weekly email offered at the end ---------- */

/**
 * The saved view behind "Email me new Sales roles that fit my profile each week": Hiring now in
 * their function, with the Ideal Fractional Profile pill on, the place Save this view makes on
 * that screen (onboardingPlace in place.ts). Only the function is a hard filter, so a company
 * whose size or country isn't on file stays in, as the pill keeps it. The name and the weekly
 * email's criteria spell the profile out.
 */
export function alertView(fn: string | null, icp: Icp | null): { name: string; place: string; criteria: ReturnType<typeof criteriaOf> } {
  const pill: Filters = { ...EMPTY_FILTERS, fn: named(fn) ? [fn!] : [], icp: !icpEmpty(icp) };
  const spelled = withIcpSpelled(pill, icp);
  return { name: viewName(spelled, "hiring", "engagements"), place: onboardingPlace(fn, icpEmpty(icp) ? null : icp), criteria: criteriaOf(spelled, null) };
}

/** A view onboarding saved before the pill (the profile spelled out, so it opened empty): its place now (place.ts). */
export { pillPlace } from "./place";


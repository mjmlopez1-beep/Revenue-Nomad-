/**
 * The new look's set-up (Setup.tsx, Onboarding.dc.html), the pure parts, so
 * scripts/test-onboard.mts checks them without a browser:
 *
 *   screens    1 Welcome, 2 Your ideal client, 3 The seats you have held, 4 Like your past clients
 *              (lookalikes), 5 Who you know, 6 Open your first company, 7 Done. Steps 1 to 5 of the
 *              stepper are screens 2 to 6. The answers go to the server after each screen
 *              (OnboardDraft.step is the screen), and the profile goes in as screen 6 opens (that
 *              ends onboarding on the server and starts the trial, so Crystal Ball names its
 *              companies), so a draft never resumes past screen 5.
 *   counts     the ideal client's live count: companies that fit, hiring now, likely to need the
 *              member's function next (the first view before it widens, firstView.ts).
 *   seats      the seats on file under the member's name, where each came from, and what a hand
 *              answer earns (the credit per fact, as on Your seats).
 *   lookalikes the owner's "absolutely necessary" step: lookalikesFor (app/post/find/lookalikes.ts)
 *              with the member's own seats as the seeds, the profile as chips, the ranked companies
 *              with why each matched, a locked company described by its free facts and never named,
 *              and the list it saves as the member's first ("Like your past clients") with its alert
 *              on, inside the plan's gates (lib/hunt.ts alertPlanProblem: weekly, never as it happens).
 *              No seats, or nothing on file to match: the step says so and is skipped.
 *   the rest   the ledger lines, the first company's rows, and the done screen's words.
 */
import type { Icp, LedgerRow, Me, SavedViewCriteria } from "@/lib/tableTypes";
import type { ListAlert } from "@/lib/mcp/alerts";
import { RN_EMPLOYEES, industryWords } from "@/lib/tableFields";

/** The seat scan's source on a seat (lib/table.ts SEAT_SCAN). */
const SEAT_SCAN = "Seat scan";
import {
  EMPTY_FILTERS, absolutePlace, applyFilters, countryOf, criteriaOf, icpEmpty, icpLabel, mySeats, namedFn, regionOf, rowsFor, shown,
  type CoInfo, type Filters, type LikeTrait, type Row,
} from "@/app/post/model";
import { likeCriteria, likeFilters, profileOf, profileWords, rankLike, traitChips, withoutTrait, type LikeRow } from "@/app/post/find/lookalikes";
import { firstView } from "./firstView";

/* ---------- the screens ---------- */

export const SCREENS = ["welcome", "ideal", "seats", "like", "know", "first", "done"] as const;
export type ScreenKey = (typeof SCREENS)[number];
/** Screens are numbered 1 to 7 (OnboardDraft.step). */
export const SCREEN_COUNT = SCREENS.length;
export const screenOf = (n: number): ScreenKey => SCREENS[Math.min(Math.max(1, n), SCREEN_COUNT) - 1];
export const screenN = (k: ScreenKey) => SCREENS.indexOf(k) + 1;
/** The stepper's five steps: screens 2 to 6. */
export const SETUP_STEPS = 5;
export const stepOfScreen = (n: number): number | null => (n >= 2 && n <= 6 ? n - 1 : null);
/** The screen the profile goes in on (onboarding ends on the server there). */
export const PROFILE_SCREEN = screenN("first");
/** "Getting set up · about N minutes left", by screen. */
export const MINUTES_LEFT: Record<ScreenKey, number> = { welcome: 5, ideal: 5, seats: 4, like: 3, know: 2, first: 1, done: 0 };
export const timeLeftWords = (k: ScreenKey) => (k === "done" ? "done" : `about ${MINUTES_LEFT[k]} ${MINUTES_LEFT[k] === 1 ? "minute" : "minutes"}${k === "welcome" ? "" : " left"}`);

/**
 * The screen to open on: the one asked for, inside the screens a draft can hold (1 to 5: from 6
 * on the member is onboarded and the app opens), and never past the function, which every screen
 * after the ideal client needs.
 */
export function resumeScreen(want: number, a: { fn: string | null }): number {
  const s = Math.min(Math.max(1, Math.round(want) || 1), PROFILE_SCREEN - 1);
  if (s > screenN("ideal") && !a.fn) return screenN("ideal");
  return s;
}

/* ---------- step 1: the ideal client ---------- */

const asMember = (me: Me, fn: string | null, icp: Icp | null): Me => ({ ...me, function: fn, icp });

export interface IdealCounts {
  /** The companies that fit, the best fit first (A first look reads its top rows). */
  rows: Row[];
  /** Of those, the ones hiring now (an open role), by id. */
  hiringIds: Set<string>;
  /** Companies on Merlin (fractional firms aside, as the table counts them). */
  total: number;
  /** Of those, the ones that fit the ideal client (all of them with nothing picked). */
  match: number;
  /** Of those, hiring now (an open role). */
  hiring: number;
  /** Likely to need the member's function next: the first view before it widens. */
  likely: number;
}

/** The live count beside the ideal client's picks. */
export function idealCounts(infos: CoInfo[], me: Me, a: { fn: string | null; icp: Icp | null; before: string[] | null; suggested: string[] }): IdealCounts {
  const who = asMember(me, a.fn, a.icp);
  const all = rowsFor("companies", infos);
  const f: Filters = { ...EMPTY_FILTERS, icp: !icpEmpty(a.icp) };
  const total = applyFilters(all, EMPTY_FILTERS, "all", "", who, true).rows.length;
  const rows = applyFilters(all, f, "all", "", who, true).rows.slice().sort((x, y) => y.i.c.friendly.score - x.i.c.friendly.score);
  const hiringIds = new Set(applyFilters(all, f, "hiring", "", who, true).rows.map((r) => r.i.c.id));
  const likely = infos.length ? firstView(infos, me, { fn: a.fn, icp: a.icp, before: a.before ?? a.suggested, suggested: a.suggested }).first : 0;
  return { rows, hiringIds, total, match: rows.length, hiring: hiringIds.size, likely };
}

/**
 * "Use Merlin's suggestion": an ideal client the member can see the reason for. From their own seats
 * (the industries and sizes of the companies they held a seat at), else the industries where most
 * companies on Merlin hired a fractional in their function, with the sizes most of those are.
 * Null when there is nothing to go on.
 */
export function suggestIcp(infos: CoInfo[], me: Me, fn: string | null, base: Icp): { icp: Icp; from: "seats" | "hires" } | null {
  const pick = (cos: CoInfo[], max: number) => {
    const ind = new Map<string, number>();
    const emp = new Map<string, number>();
    for (const i of cos) {
      const x = shown(i.c.cells.industry);
      const y = shown(i.c.cells.employees);
      if (x) ind.set(x, (ind.get(x) ?? 0) + 1);
      if (y) emp.set(y, (emp.get(y) ?? 0) + 1);
    }
    const top = (m: Map<string, number>, k: number) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, k).map(([v]) => v);
    return { industries: top(ind, max), employees: RN_EMPLOYEES.filter((v) => top(emp, 3).includes(v)) };
  };
  const seats = [...new Map(mySeats(infos, me).map((s) => [s.i.c.id, s.i])).values()];
  if (seats.length) {
    const p = pick(seats, 4);
    if (p.industries.length || p.employees.length) return { icp: { ...base, industries: p.industries, employees: p.employees }, from: "seats" };
  }
  const nfn = namedFn(fn);
  if (!nfn) return null;
  const hired = infos.filter((i) => i.fnState.hired.includes(nfn));
  if (hired.length < 3) return null;
  const p = pick(hired, 4);
  return p.industries.length ? { icp: { ...base, industries: p.industries, employees: p.employees }, from: "hires" } : null;
}

/** The ideal client in one line: "Sales · Software, Fintech · 11 to 200 people". */
export function idealLine(fn: string | null, icp: Icp): string {
  const parts = icpLabel(icp).split(" · ").filter(Boolean);
  return [namedFn(fn) ?? fn ?? "", parts.length ? parts.join(" · ") : "any industry, any size"].filter(Boolean).join(" · ");
}

/**
 * A company as the set-up describes it without its name: its free facts ("Software · $5M–$20M ·
 * 51–200 people · Texas"). A locked company is only ever this; one the member can see is named too.
 */
export function factsLine(i: CoInfo): string {
  const c = i.c;
  const emp = shown(c.cells.employees);
  return [shown(c.cells.industry), shown(c.cells.revenue), emp && `${emp} people`, regionOf(c) ?? countryOf(c)].filter(Boolean).join(" · ");
}
/** "A software company" for a locked one, its name for one the member can see. Never the name of a locked company. */
export function companyLabel(i: CoInfo): string {
  if (!i.c.hidden) return i.c.name;
  const ind = shown(i.c.cells.industry);
  if (!ind) return "A locked company";
  // "SaaS", "AI" and the like keep their capitals; other words go lower case after the article.
  const word = (industryWords([ind])[0] ?? ind).replace(" (all)", "").split(" ").map((w) => (/[A-Z].*[A-Z]/.test(w) ? w : w.toLowerCase())).join(" ");
  return `${/^[aeiou]/i.test(word) ? "An" : "A"} ${word} company`;
}

/* ---------- step 2: the seats ---------- */

/** Where a seat under the member's name came from, in their words. */
export function seatSource(e: { source: string; cells: Record<string, { s: string; mine?: boolean; from?: string } | undefined> }): string {
  const op = e.cells.operator;
  if (e.source === "Member added" && op?.mine) return "You added it.";
  if (op?.mine) return "You claimed it.";
  if (e.source === "Published engagement" || e.source === "Member success story") return "From the fractional work you published on Revenue Nomad.";
  if (e.source === SEAT_SCAN) return "Revenue Nomad's seat scan found it with your name.";
  if (op?.from === "records") return "Revenue Nomad's records name you here. Nobody has checked it yet.";
  return "Another member put your name on this seat.";
}

/** Hours a week, one tap each on a confirmed seat that has none on file. */
export const HOURS_PICKS = ["10", "20", "30", "40"] as const;

/* ---------- step 3: lookalikes ---------- */

/** The list the lookalikes step saves, the member's first. */
export const LIKE_LIST_NAME = "Like your past clients";
/** Ranked companies the step shows. */
export const LIKE_SHOWN = 5;

export interface LikeStep {
  /** The member's seats' companies: the seeds (their own, so named). */
  seeds: CoInfo[];
  /** The profile's trait tokens (lookalikes.ts profileOf), less the chips taken off. */
  tokens: string[];
  chips: { k: LikeTrait; label: string }[];
  words: string;
  ranked: LikeRow[];
  /** Why the step has nothing to show: no seat yet, or nothing on file at the seeds to match. */
  empty: "noSeats" | "noTraits" | null;
}

/**
 * The lookalikes for the member's seats. `seedIds` default to the companies of every seat under
 * their name (lookalikes.ts defaultSeeds); `off` are the chips the member took off.
 */
export function likeStep(infos: CoInfo[], me: Me, seedIds: string[], off: LikeTrait[] = []): LikeStep {
  const byId = new Map(infos.map((i) => [i.c.id, i]));
  const seeds = [...new Set(seedIds)].map((id) => byId.get(id)).filter((i): i is CoInfo => !!i);
  if (!seeds.length) return { seeds, tokens: [], chips: [], words: profileWords([]), ranked: [], empty: "noSeats" };
  let tokens = profileOf(seeds);
  for (const k of off) tokens = withoutTrait(tokens, k);
  const chips = traitChips(tokens);
  if (!chips.length) return { seeds, tokens, chips, words: profileWords(tokens), ranked: [], empty: "noTraits" };
  const rows = applyFilters(rowsFor("companies", infos), likeFilters(tokens), "all", "", me, true).rows;
  return { seeds, tokens, chips, words: profileWords(tokens), ranked: rankLike(rows, tokens, seeds), empty: null };
}

/** One ranked row as the step shows it: a locked company described by its free facts, never named. */
export function likeRowView(r: LikeRow): { id: string; title: string; meta: string; why: string; hired: string | null; locked: boolean } {
  const i = r.row.i;
  const hired = i.fnState.hired.filter((f) => f !== "Other");
  return {
    id: i.c.id,
    title: companyLabel(i),
    meta: factsLine(i),
    why: r.why || "Shares your past clients' profile",
    hired: hired.length ? `Hired fractional ${hired.slice(0, 3).join(", ")}` : null,
    locked: !!i.c.hidden,
  };
}

/**
 * The alert the lookalikes list is saved with: on, weekly, by email and in the bell. Weekly passes
 * every plan's gate (Free has no "as it happens", lib/hunt.ts); the triggers are the list's defaults.
 */
export const LIKE_ALERT: Partial<ListAlert> = { on: true, every: "weekly", email: true, slack: false, bell: true };

/** The savedView action that saves the lookalikes as the member's first list, its alert on or off. */
export function likeListAction(tokens: string[], alertOn: boolean): { type: "savedView"; op: "save"; name: string; place: string; criteria: SavedViewCriteria; email: boolean; list: { kind: "companies"; alert: Partial<ListAlert> } } {
  const f: Filters = { ...EMPTY_FILTERS, like: tokens };
  const place = absolutePlace({ t: "companies", v: "all", s: "best", f, q: "" });
  const criteria = { ...criteriaOf({ ...f, like: [] }, null), ...likeCriteria(tokens) } as SavedViewCriteria;
  return { type: "savedView", op: "save", name: LIKE_LIST_NAME, place, criteria, email: alertOn, list: { kind: "companies", alert: { ...LIKE_ALERT, on: alertOn, email: alertOn } } };
}

/* ---------- the credits ---------- */

/** The credits beside every screen: what they started with, earned, spent, and have. */
export function ledgerLines(me: Pick<Me, "credits">, ledger: Pick<LedgerRow, "delta" | "reason">[]): { start: number; earned: number; bonus: number; spent: number; have: number } {
  let earned = 0;
  let spent = 0;
  let bonus = 0;
  for (const l of ledger) {
    if (l.delta > 0 && /invite|referral/i.test(l.reason)) bonus += l.delta;
    else if (l.delta > 0) earned += l.delta;
    else spent -= l.delta;
  }
  return { start: me.credits - earned - bonus + spent, earned, bonus, spent, have: me.credits };
}

/* ---------- step 5: the first company ---------- */

/** One company the first company step offers, from Crystal Ball (or the first view when it is empty). */
export interface FirstRow {
  id: string;
  /** From the member's Crystal Ball (it opens as Crystal Ball opens it), else from their first view (the company's own price). */
  crystal: boolean;
  /** Its name when the member may see it here (Crystal Ball on the trial names them), else null. */
  name: string | null;
  meta: string;
  band: string | null;
  why: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The done screen's head: what got done. */
export function doneHead(done: number, of: number, opened: string | null): { label: string; head: string } {
  return {
    label: done >= of ? `All ${of} done` : `${done} of ${of} done, the rest are waiting`,
    head: opened ? `You are set up, and ${opened} is open` : done ? "You are set up" : "Nothing is set up yet, and that is fine",
  };
}

/** "3 seats", "1 seat". */
export const seatsWord = (n: number) => plural(n, "seat", "seats");
export const companiesWord = (n: number) => plural(n, "company", "companies");
export { rowsFor, type Row };

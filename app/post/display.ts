/**
 * Small rules for what the table, the phone cards and the record show, kept out of the
 * components so the checks (scripts/test-model.mts) run them without a browser:
 *   - which chips fit the Companies table's "Functions hired" cell (fnChipPlan)
 *   - no confirmation mark beside a name nobody verified (marksConfirmed), and how many members
 *     confirmed it, said inside Verify (confirmedWords)
 *   - which job posting a hiring company's record opens once the member unlocked it (postingToOpen)
 *   - the day's unlock limit, where it binds before the balance (unlocksLeft, unlocksLeftWords)
 *   - Recently hired folded to one line on a phone (foldParts)
 */
import type { Cell, EngagementRec, Me } from "@/lib/tableTypes";
import { webLink } from "@/lib/links";
import { COMPANY_PRICE } from "@/lib/tableFields";
import type { LeadLine } from "@/lib/leaders/types";
import { fnGap, isOpenRole, shown, type CoInfo } from "./model";

/** One chip in a company's functions: hired fractionally, an open role only, or only in member stories. */
export interface FnChip {
  f: string;
  kind: "hired" | "hiring" | "story";
}

/**
 * The functions chips of a company: the ones it hired fractionally (the member's own first), then
 * the ones with an open role and no hire yet, then the ones only member stories mention, at most
 * `max` of them. `rest` is what "+N" stands for. `gap`: the dashed "No fractional Sales yet" shows
 * (they hired other functions and nothing on file names the member's, and the caller wants it).
 * `total` caps every chip in the cell, the dashed one included (the Companies table: 3), so one
 * company with five functions never widens the whole column. The dashed chip always keeps its place.
 */
export function fnChipPlan(
  i: CoInfo,
  mine: string | null,
  opts: { max?: number; total?: number; gap?: boolean } = {},
): { chips: FnChip[]; rest: string[]; gap: boolean; led: LeadLine | null; team: LeadLine | null } {
  const { max = 3, total, gap = true } = opts;
  const { hired, hiring, story } = i.fnState;
  const ordered = mine && hired.includes(mine) ? [mine, ...hired.filter((f) => f !== mine)] : hired;
  const all: FnChip[] = [...ordered.map((f) => ({ f, kind: "hired" as const })), ...hiring.map((f) => ({ f, kind: "hiring" as const })), ...story.map((f) => ({ f, kind: "story" as const }))];
  // From the company's website: a full-time leader of the member's function turns the dashed chip
  // into "FT Sales Leader since 2024" (shown even while the filter is on: it says something
  // the filter doesn't), and a fractional or interim one is "Fractional CMO on the team".
  const g = fnGap(i, mine);
  const showGap = g.gap && (gap || !!g.led);
  const extra = (showGap ? 1 : 0) + (g.team ? 1 : 0);
  const room = Math.max(1, total ? Math.min(max, total - extra) : max);
  return { chips: all.slice(0, room), rest: all.slice(room).map((x) => x.f), gap: showGap, led: showGap ? g.led : null, team: g.team };
}

/**
 * Whether a visible fact may carry a confirmation mark: the tick and count in the record, or the
 * check that flashes after an unlock. Never beside a seat holder's name from public profiles that
 * nobody has verified yet (Cell.unverified): there a tick reads as "verified". Verify says how many
 * members confirmed it instead. A verified name keeps the marks every fact gets.
 */
export const marksConfirmed = (cell: Cell | undefined): boolean => !!cell && cell.s === "value" && !cell.unverified && !cell.likely;

/** Inside Verify, how many members confirmed the name: "1 member confirmed this name." */
export function confirmedWords(n: number): string {
  if (n <= 0) return "No member has confirmed this name yet.";
  return `${n} ${n === 1 ? "member" : "members"} confirmed this name.`;
}

/**
 * The job posting a hiring company's record leads with once the member unlocked the company
 * (CompanyRec.unlocked): the open role the record was opened at, else the newest open role whose
 * posting they can see. Null while the company is hidden, when they see it for another reason
 * (they added to it, or held a seat there), or when no open role has a posting to open.
 */
export function postingToOpen(i: CoInfo, focus: string | null): { e: EngagementRec; href: string } | null {
  if (i.c.hidden || !i.c.unlocked) return null;
  const withPosting = i.engs.filter((e) => isOpenRole(e) && !!webLink(shown(e.cells.posting)));
  const e = withPosting.find((x) => x.id === focus) ?? withPosting[0];
  return e ? { e, href: webLink(shown(e.cells.posting))! } : null;
}

/**
 * Unlocks the member has left today, when the day's limit binds before the balance: Me.unlocksLeft
 * is below their credits (25 on an account's first day, then 100 in any 24 hours; lib/table.ts
 * unlockRoom). Null when the credits run out first, or no limit is in play.
 */
export function unlocksLeft(me: Pick<Me, "credits" | "unlocksLeft"> & Partial<Pick<Me, "openAll">>): number | null {
  // Pro and Close open everything: no "N unlocks left today" (email and phone keep the day's limit on the server).
  if (me.openAll) return null;
  const left = me.unlocksLeft;
  return left === null || left === undefined || left >= me.credits ? null : left;
}

/** "25 unlocks left today", near the balance and on the record's unlock line. Null when the limit doesn't bind. */
export function unlocksLeftWords(me: Pick<Me, "credits" | "unlocksLeft"> & Partial<Pick<Me, "openAll">>): string | null {
  const left = unlocksLeft(me);
  if (left === null) return null;
  return left === 0 ? "No unlocks left today" : `${left} ${left === 1 ? "unlock" : "unlocks"} left today`;
}

/**
 * The free company of the day can be used now: one is left today (Me.freeCompany) and the day's
 * unlock limit still has room for a company (it counts as COMPANY_PRICE, like a paid one). At the
 * limit, every unlock button says "Unlocks again tomorrow", this one too.
 */
export function freeCompanyNow(me: Pick<Me, "freeCompany" | "unlocksLeft"> & Partial<Pick<Me, "proOpens">>): boolean {
  // The trial: its opens have their own daily count (TRIAL_OPENS_DAILY), outside the day's unlock limit.
  if (me.proOpens) return me.proOpens.left > 0;
  return !!me.freeCompany && (me.unlocksLeft ?? Infinity) >= COMPANY_PRICE;
}
/**
 * Today's unlocks are used up for a company: its button says "Unlocks again tomorrow" and spends
 * nothing. Never while a free open on Pro is left (those don't count toward the limit).
 */
export function companyLater(me: Pick<Me, "freeCompany" | "unlocksLeft" | "credits"> & Partial<Pick<Me, "proOpens">>): boolean {
  if (me.proOpens && me.proOpens.left > 0) return false;
  return (me.unlocksLeft ?? Infinity) < COMPANY_PRICE && (me.credits >= COMPANY_PRICE || (!!me.freeCompany && !me.proOpens));
}
/** The unlock button's words while the free company of the day is left. */
export const UNLOCK_FREE = "Unlock free · 1 left today";
/** The same, said once near the balance and on Get started. */
export const FREE_COMPANY_TODAY = "1 free company today";
/** The unlock button's words while a free open is left: Pro's count, else the free company of the day. */
export const unlockFreeWords = (me: Partial<Pick<Me, "proOpens">>) => (me.proOpens ? `Open free · ${me.proOpens.left} of ${me.proOpens.of} left today` : UNLOCK_FREE);
/** Near the balance and on Get started: the trial's "39 of 40 companies left today", else the free company of the day. */
export const freeTodayWords = (me: Partial<Pick<Me, "proOpens">>) =>
  me.proOpens ? `${me.proOpens.left} of ${me.proOpens.of} companies left today` : FREE_COMPANY_TODAY;
/** The trial's companies are used for today: the line at a company's unlock (TRIAL_OPENS_USED). */
export const proOpensUsed = (me: Partial<Pick<Me, "proOpens">>) => !!me.proOpens && me.proOpens.left <= 0;

/** Why a balance can't all be spent today, for the tooltips beside "25 unlocks left today". */
export const UNLOCKS_LEFT_TIP = "New accounts can unlock 25 facts on their first day, then up to 100 a day. Credits you don't spend stay yours.";

/**
 * Recently hired on a phone, folded to one line once it has done its job: "Finance hires ·
 * 6 mo · in my profile · no Sales yet". Its parts: who was hired, how recently, which
 * companies (`scope`, as the sentence names them), and "no Sales yet" while that switch is on.
 */
export function foldParts(o: { fns: string[]; within: number; scope: string; mine: string | null; notMine: boolean }): string[] {
  const who = !o.fns.length ? "Hires in any function" : o.fns.length <= 2 ? `${o.fns.join(" or ")} hires` : `Hires in ${o.fns.length} functions`;
  const when = o.within > 0 ? `${o.within} mo` : "any time";
  return [who, when, o.scope, ...(o.mine && o.notMine ? [`no ${o.mine} yet`] : [])];
}

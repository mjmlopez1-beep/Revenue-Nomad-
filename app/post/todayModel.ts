/**
 * Today's data, the pure parts (app/post/Today.tsx draws it), so scripts/test-model.mts checks
 * them with no browser: which answer to GET ?today=1 is the small one, the Crystal Ball's companies
 * since the last visit, the roles opened since, and "Since Tuesday".
 */
import type { Me, PlanView } from "@/lib/tableTypes";
import type { RadarRow, RadarView } from "@/lib/radar/types";
import { FEATURE_NAME } from "@/lib/radar/types";
import { COMPANY_PRICE } from "@/lib/tableFields";
import type { MovesWire } from "@/lib/moves";
import { isFirm, isOpenRole, namedFn, shown, type CoInfo } from "./model";

/** GET /api/table?today=1 (BUILD-LIST contract, WS2). */
export interface TodayAnswer {
  me: Me;
  plan?: PlanView;
  freeCompany?: boolean;
  radar: { day: string; fn: string | null; rows: RadarRow[]; newCount: number; ready?: boolean };
  /** Your three moves today (lib/moves.ts). Left out by a server from before them. */
  moves?: MovesWire;
  since?: { radar: number; roles: number; follows: number; sinceIso: string };
}
/** What Today draws from, whichever way it came. */
export interface TodayData {
  day: string | null;
  rows: RadarRow[];
  /** Companies new in the Crystal Ball since the last visit (or on its latest day, on a first visit). */
  newCount: number;
  since: { radar: number; roles: number; follows: number; sinceIso: string } | null;
  from: "today" | "radar";
  /** Today's moves as the server picked them. Null from a server without them: Home makes them of the top rows, with no way in from a network. */
  moves: MovesWire | null;
  /**
   * Crystal Ball's latest day with companies and how many it has: the count of new companies on
   * its menu item and in the bar (useRadarNew in TopBar.tsx). Null when it has none, or isn't
   * ready (no function yet).
   */
  latest: { day: string; n: number } | null;
}
/** The rows Today keeps from the radar. */
export const TODAY_ROWS = 4;
/** An answer bigger than this to ?today=1 is a full view (a server without the endpoint): it isn't read. */
export const TODAY_MAX_BYTES = 200_000;

const dayOf = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : null);

/**
 * The answer is the small one the contract describes, not a full view or an error. It carries its
 * rows' companies (TodayView in lib/viewWire.ts); a view carries its stats, and never a radar.
 */
export function isTodayAnswer(j: unknown): j is TodayAnswer {
  const x = j as Partial<TodayAnswer> & { stats?: unknown };
  return !!x && typeof x === "object" && !x.stats && !!x.radar && Array.isArray(x.radar.rows) && typeof x.radar.newCount === "number";
}

/** Companies in the radar's days after the last visit (the latest day with any, on a first visit). */
export function radarSince(v: Pick<RadarView, "days">, sinceIso: string | null): number {
  const after = dayOf(sinceIso);
  if (!after) return v.days.find((d) => d.companies > 0)?.companies ?? 0;
  return v.days.filter((d) => d.day > after).reduce((n, d) => n + d.companies, 0);
}

/** Open roles in the member's function that opened since the last visit (never a fractional firm's). */
export function rolesSince(infos: CoInfo[], fn: string | null, sinceIso: string | null): number {
  const own = namedFn(fn);
  const at = Date.parse(sinceIso ?? "");
  if (!own || !Number.isFinite(at)) return 0;
  let n = 0;
  for (const i of infos)
    for (const e of i.engs) {
      if (isFirm(i.c) || !isOpenRole(e) || e.unseen || shown(e.cells.function) !== own) continue;
      const opened = Date.parse(e.openedAt ?? (e.opened ? `${e.opened}T00:00:00Z` : ""));
      if (Number.isFinite(opened) && opened > at) n++;
    }
  return n;
}

/** "Since Tuesday", "Since earlier today", "Since Nov 12" (a week or more ago). */
export function sinceWords(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Since your last visit";
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return "Since earlier today";
  if (days === 1) return "Since yesterday";
  if (days < 7) return `Since ${d.toLocaleDateString("en-US", { weekday: "long" })}`;
  return `Since ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/* ---------- the first session: pure words and choices (scripts/test-today.mts checks them) ---------- */

/**
 * The one button on a locked Crystal Ball company, by plan (Me.crystal) and balance:
 *   "crystal"  Trial and Pro "Open", Free "Open free · 1 left today": the free open from Crystal Ball;
 *   "unlock"   Free once today's is used: the company's ordinary unlock, "Unlock · 2 credits" (the free
 *              company of the day first, where one is left), with "Pro opens all of these free" beside it;
 *   "wall"     the same, short of credits: the same words, and a click shows the zero-credit wall;
 *   "later"    today's unlock limit binds: "Unlocks again tomorrow", nothing to click.
 * Null: billing is off (the record's own Unlock company, as anywhere).
 */
export type CrystalButton = { kind: "crystal" | "unlock" | "wall" | "later"; label: string; pro: boolean };
export const CRYSTAL_PRO_LINK = "Pro opens all of these free";
export function crystalButton(me: Pick<Me, "crystal" | "credits" | "freeCompany" | "unlocksLeft">, price = COMPANY_PRICE): CrystalButton | null {
  const mode = me.crystal ?? null;
  if (!mode) return null;
  if (mode === "all") return { kind: "crystal", label: "Open", pro: false };
  if (mode === "one") return { kind: "crystal", label: "Open free · 1 left today", pro: false };
  const free = !!me.freeCompany && (me.unlocksLeft ?? Infinity) >= price;
  if ((me.unlocksLeft ?? Infinity) < price && (me.credits >= price || !!me.freeCompany)) return { kind: "later", label: "Unlocks again tomorrow", pro: true };
  if (free) return { kind: "unlock", label: "Unlock free · your company of the day", pro: true };
  return { kind: me.credits >= price ? "unlock" : "wall", label: `Unlock · ${price} credits`, pro: true };
}
/** A click anywhere on a locked Crystal Ball company opens it free first where the plan does (Trial, Pro, Free's one a day); else it only opens the record, whose unlock states its cost. */
export const rowOpensFree = (me: Pick<Me, "crystal">) => me.crystal === "all" || me.crystal === "one";
/** Free, after today's free Crystal Ball company: the line under a move's or a card's button. */
export const CRYSTAL_USED_UNLOCK = `Today's free ${FEATURE_NAME} company is used. This one unlocks for ${COMPANY_PRICE} credits.`;

/**
 * An open role's posted terms, as the member can see them once its company is open: "$150/hr · 20
 * hours a week", "No rate posted · 10 hours a week". Null while the rate is still locked (the
 * posting's unlock opens it with the posting).
 */
export function roleTermsLine(cells: Record<string, { s: string; v?: unknown } | undefined>): string | null {
  const rate = cells.rate;
  if (rate?.s === "locked") return null;
  const r = rate?.s === "value" && typeof rate.v === "string" && rate.v.trim() ? rate.v.trim() : null;
  const h = cells.hours?.s === "value" && Number(cells.hours.v) > 0 ? Number(cells.hours.v) : null;
  return [r ?? "No rate posted", h ? `${h} ${h === 1 ? "hour" : "hours"} a week` : null].filter(Boolean).join(" · ");
}

/** Home's one-time card when the trial starts: "For 21 days every Crystal Ball company opens free (14 today). Open as many as you like." */
export function trialCardLine(daysLeft: number | null, today: number): string {
  const days = daysLeft && daysLeft > 0 ? daysLeft : 21;
  return `For ${days === 1 ? "today" : `${days} days`} every ${FEATURE_NAME} company opens free${today > 0 ? ` (${today} today)` : ""}. Open as many as you like.`;
}
/** The trial on Home, for a phone (the top bar's pill is in its More sheet there): "Pro trial · 18 days left". Null off the trial. */
export function trialPillWords(plan: Pick<PlanView, "name" | "trialDaysLeft"> | null | undefined): string | null {
  if (!plan || plan.name !== "trial" || !plan.trialDaysLeft) return null;
  return `Pro trial · ${plan.trialDaysLeft === 1 ? "last day" : `${plan.trialDaysLeft} days left`}`;
}

/** "Show you in the Fractionals directory?" waits on Home until the member has opened something, or comes back for a second visit. */
export const showMeDue = (me: Pick<Me, "fractionals" | "unlocked" | "companiesUnlocked" | "holdersUnlocked">, sinceAt: string | null) =>
  me.fractionals == null && (me.unlocked > 0 || (me.companiesUnlocked ?? 0) > 0 || (me.holdersUnlocked ?? 0) > 0 || !!sinceAt);

/** Crystal Ball's Today / 7 days / 30 days: shown only when they list different numbers of companies (three equal counts say nothing). */
export const rangesWorthShowing = (ranges: { companies: number }[] | undefined) => !!ranges && ranges.length > 1 && ranges.some((r) => r.companies !== ranges[0].companies);

/** Home's line under the moves: tomorrow brings three more. */
export const TOMORROW_LINE = "Tomorrow: 3 new moves.";

/**
 * Home's search: companies the member can see by name, and the Crystal Ball companies their plan
 * names (Trial and Pro: RadarRow.name, still locked in the table), matched at the start of a word of
 * the name. At most `max`, names that start with the text first. Nothing under 2 characters.
 */
export function nameMatches<T extends { id: string; name: string }>(q: string, list: T[], max = 4): T[] {
  const k = q.trim().toLowerCase();
  if (k.length < 2) return [];
  const seen = new Set<string>();
  const hits: { x: T; at: number }[] = [];
  for (const x of list) {
    if (!x.name || seen.has(x.id)) continue;
    const n = x.name.toLowerCase();
    const at = n.startsWith(k) ? 0 : n.split(/[^a-z0-9]+/).some((w) => w && w.startsWith(k)) || n.includes(` ${k}`) ? 1 : -1;
    if (at < 0) continue;
    seen.add(x.id);
    hits.push({ x, at });
  }
  return hits.sort((a, b) => a.at - b.at).slice(0, max).map((h) => h.x);
}
/** The Crystal Ball companies Today's answer names for this member (their plan's names), for the search. */
export function crystalNames(data: Pick<TodayData, "rows" | "moves"> | null): { id: string; name: string }[] {
  if (!data) return [];
  const out: { id: string; name: string }[] = [];
  for (const r of [...(data.moves?.list.map((w) => w.row) ?? []), ...data.rows]) if (r.name) out.push({ id: r.id, name: r.name });
  return out;
}


/**
 * The Pipeline page in the new look (Pipeline.dc.html), as pure data so scripts/test-pipeline2.mts
 * checks it with no browser: the board's columns (Merlin's own stages, so nothing stored changes),
 * each card's words (the seat pitched, the value a month, the way in, the next move with its due
 * date, the proposal or contract), the filters and sorts, the totals, and the two Example cards of
 * a first visit.
 *
 * Columns: To reach out, Sent, Replied, Meeting, Proposal, Won, then Lost folded under Won (Lost,
 * Not now and Went quiet, each card saying which). Every stage is lib/pipeline.ts's own.
 *
 * Totals count the member's own deals only. The examples are wrapped (examples.ts Example<T>), so
 * they can't reach an action, a count or a total; a page draws `x.value` with its Example label.
 */
import { CHANNEL_WORDS, LINE, STAGE_WORDS, shortDay, type PipelineRec, type PipelineView, type Stage } from "@/lib/pipeline";
import { example, realOnly, type Example } from "../examples";

/* ---------- the columns ---------- */

/** The board's columns, left to right. "closed" folds Lost, Not now and Went quiet under Won. */
export type ColKey = "reach" | "sent" | "replied" | "meeting" | "proposal" | "won" | "closed";
export const COLS: readonly ColKey[] = ["reach", "sent", "replied", "meeting", "proposal", "won", "closed"];
export const CLOSED_STAGES: readonly Stage[] = ["lost", "notnow", "quiet"];
export const colOf = (s: Stage): ColKey => ((CLOSED_STAGES as readonly Stage[]).includes(s) ? "closed" : (s as ColKey));
export const COL_WORDS: Record<ColKey, string> = { reach: STAGE_WORDS.reach, sent: STAGE_WORDS.sent, replied: STAGE_WORDS.replied, meeting: STAGE_WORDS.meeting, proposal: STAGE_WORDS.proposal, won: STAGE_WORDS.won, closed: "Lost" };
/** What an empty column says (a first visit, or nothing there yet). */
export const COL_NONE: Record<ColKey, string> = {
  reach: "Companies you want to win, before you write. Add one, or pick from a list.",
  sent: "A deal lands here when your note goes out.",
  replied: "Merlin moves a deal here when they write back.",
  meeting: "From your calendar, or when you mark a meeting.",
  proposal: "A deal lands here when your proposal goes out.",
  won: "When the client signs, or you mark it won.",
  closed: "Nothing lost. Lost, Not now and Went quiet fold here.",
};
/** The stage a card dropped on a column goes to (Lost for the folded column). */
export const dropStage = (k: ColKey) => (k === "closed" ? "lost" : k);
/** The stacks the board draws: one column each, Lost folded under Won. */
export const STACKS: readonly ColKey[][] = [["reach"], ["sent"], ["replied"], ["meeting"], ["proposal"], ["won", "closed"]];

/* ---------- words ---------- */

export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const dayMs = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
/** "Mon Nov 23" from "2026-11-23". */
export const dayWords = (d: string) => `${DOW[new Date(dayMs(d)).getUTCDay()]} ${shortDay(d)}`;
const first = (s: string | null | undefined) => String(s ?? "").trim().split(/\s+/)[0] ?? "";

/** When a deal's next move is due: "Due today", "Due Fri Nov 20, 3 days late", "Due Wed Nov 25". `hot`: due today or late. */
export function dueWords(due: string | null, today: string): { text: string; hot: boolean; late: number } {
  if (!due) return { text: "", hot: false, late: 0 };
  if (due === today) return { text: "Due today", hot: true, late: 0 };
  if (due < today) {
    const n = Math.round((dayMs(today) - dayMs(due)) / 86_400_000);
    return { text: `Due ${dayWords(due)}, ${n === 1 ? "1 day" : `${n} days`} late`, hot: true, late: n };
  }
  return { text: `Due ${dayWords(due)}`, hot: false, late: 0 };
}

/** Who it went to, in the card's words: their first name as the member saw it, else "the CEO", else "them". */
const whoOf = (r: PipelineRec) => (r.to.name ? first(r.to.name) : r.to.label && r.to.label !== "nobody yet" ? r.to.label : "them");

/** The deal's next move and when, as the card and the drawer say it. */
export function nextOf(r: PipelineRec, today: string): { title: string; due: string; hot: boolean } {
  const d = dueWords(r.due, today);
  const who = whoOf(r);
  switch (r.stage) {
    case "reach":
      return { title: r.route ? "Take the first step of your route" : r.name ? `Write your note${r.to.name ? ` to ${first(r.to.name)}` : ""}` : "Open the company, then write your note", due: "Nothing sent yet", hot: false };
    case "sent":
      return { title: r.ask ? "No reply seen. Did they reply?" : `Follow up with ${who}`, due: d.text || "Waiting to hear back", hot: d.hot };
    case "replied":
      return { title: `Book a meeting with ${who}`, due: d.text, hot: d.hot };
    case "meeting":
      return { title: r.paper ? "Send the proposal" : "Send a proposal", due: d.text, hot: d.hot };
    case "proposal":
      if (r.paper?.tone === "you") return { title: r.paper.kind === "contract" ? "Sign the contract: you are next" : "Countersign the proposal", due: "Due today", hot: true };
      return { title: "Check in on your proposal", due: d.text, hot: d.hot };
    case "won":
      return { title: r.seat ? "Your seat here is confirmed" : r.won ? "Add it as your seat" : "Add the terms and your seat", due: r.won?.start ? `Starts ${monthShort(r.won.start)}` : "", hot: false };
    case "lost":
      return { title: "Closed. Reopen it any time", due: "", hot: false };
    case "notnow":
      return { title: "Not now. Reopen it any time", due: "", hot: false };
    default:
      return { title: "No reply after your follow-ups", due: "", hot: false };
  }
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthShort = (ym: string) => (/^\d{4}-\d{2}/.test(ym) ? `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}` : ym);

/** A route the member went with there (Your way in), as the plans line names it ("via Casey → Rita"). */
export interface RouteHint {
  via: string;
}

/**
 * The deal's way in, in the card's words: the route the member went with, the intro it came
 * through, the peer who passed it, the peer they teamed with. Null: none chosen yet (the drawer
 * shows Merlin's best route for the company).
 */
export function wayOf(r: PipelineRec, route?: RouteHint | null): string | null {
  if (route) return `Your route ${route.via}`;
  if (r.intro) return `Through ${r.intro.by}'s intro${r.intro.status === "made" ? "" : r.intro.status === "declined" ? ", declined" : ", asked"}`;
  if (r.lead) return `A lead ${first(r.lead.by)} passed you`;
  if (r.team) return `Teamed with ${r.team.with}`;
  return null;
}

/** Who it went to and how ("To Dana · Email"), or null before anything went out. */
export const toWords = (r: PipelineRec) =>
  r.stage === "reach" || (!r.to.name && !r.to.role) ? null : `To ${r.to.name ?? (r.to.role ? r.to.role : r.to.label)} · ${CHANNEL_WORDS[r.channel]}`;

/** The closed kind on a folded card: Lost, Not now or Went quiet. */
export const closedWords = (s: Stage) => (s === "lost" ? "Lost" : s === "notnow" ? "Not now" : s === "quiet" ? "Went quiet" : null);

/* ---------- filters and sorts ---------- */

export type FilterKey = "all" | "due" | "paper" | "noway" | "peer";
export const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All deals" },
  { key: "due", label: "Next move due" },
  { key: "paper", label: "Has a proposal or contract" },
  { key: "noway", label: "No way in chosen" },
  { key: "peer", label: "With a peer" },
];
export function passes(k: FilterKey, r: PipelineRec, today: string, route?: RouteHint | null): boolean {
  switch (k) {
    case "due":
      return nextOf(r, today).hot && colOf(r.stage) !== "closed";
    case "paper":
      return !!r.paper;
    case "noway":
      return !wayOf(r, route);
    case "peer":
      return !!(r.lead || r.team || r.intro);
    default:
      return true;
  }
}

export type SortKey = "due" | "value" | "company";
export const SORTS: { key: SortKey; label: string }[] = [
  { key: "due", label: "Sort: next move due" },
  { key: "value", label: "Sort: value" },
  { key: "company", label: "Sort: company" },
];
/** In order: next move due (the latest first, then the soonest, then none), value (highest first), or company (A to Z, locked last). */
export function sortDeals(list: readonly PipelineRec[], k: SortKey): PipelineRec[] {
  const out = [...list];
  if (k === "value") return out.sort((a, b) => b.monthly - a.monthly || b.updatedAt.localeCompare(a.updatedAt));
  if (k === "company") return out.sort((a, b) => (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0) || (a.name ?? "").localeCompare(b.name ?? "") || a.id.localeCompare(b.id));
  return out.sort((a, b) => (a.due ?? "9999") .localeCompare(b.due ?? "9999") || b.updatedAt.localeCompare(a.updatedAt));
}

/* ---------- totals (the member's own deals only) ---------- */

export interface ColTotal {
  n: number;
  monthly: number;
  /** "$27,000 a month", "$14,500 a month won", or "No value yet". */
  words: string;
}
export function colTotal(k: ColKey, list: readonly PipelineRec[]): ColTotal {
  const mine = list.filter((r) => colOf(r.stage) === k);
  const monthly = mine.reduce((n, r) => n + r.monthly, 0);
  const words = k === "closed" ? "" : monthly > 0 ? `${money(monthly)} a month${k === "won" ? " won" : ""}` : mine.length ? "No value yet" : "";
  return { n: mine.length, monthly, words };
}

/** The toolbar's line: "8 open · $71,500 a month in play · 3 next moves due". Examples never count. */
export function summaryWords(v: Pick<PipelineView, "entries" | "openMonthly" | "today">, routes?: Map<string, RouteHint>): string {
  const open = v.entries.filter((r) => LINE.includes(r.stage) && r.stage !== "won");
  if (!v.entries.length) return "No deals yet. The 2 cards marked Example show how one works.";
  const due = open.filter((r) => passes("due", r, v.today, routes?.get(r.company))).length;
  return `${open.length} open · ${v.openMonthly > 0 ? `${money(v.openMonthly)} a month in play` : "no values yet"} · ${due} ${due === 1 ? "next move due" : "next moves due"}`;
}

/* ---------- the first visit's examples ---------- */

/** An Example card: what a deal looks like, never a deal. */
export interface ExampleCard {
  company: string;
  facts: string;
  stage: Stage;
  pitch: string;
  monthly: number;
  way: string;
  to: string;
  next: string;
  due: string;
  how: string;
  paper: string | null;
  /** What happened, newest first (the drawer). */
  log: { d: string; t: string }[];
}
export const EXAMPLE_CARDS: readonly Example<ExampleCard>[] = [
  example({
    company: "Northwind Clinics",
    facts: "Health Care · $20M-$50M",
    stage: "sent",
    pitch: "Fractional VP Sales",
    monthly: 8000,
    way: "Through the fractional who held the seat",
    to: "To Sam Iverson, CEO · Email",
    next: "Follow up with Sam",
    due: "Due in 3 days",
    how: "From your note, on the day you send it",
    paper: null,
    log: [
      { d: "Day 4", t: "Follow-up 1 due. Merlin nudges you" },
      { d: "Day 1", t: "Note sent by email" },
    ],
  }),
  example({
    company: "Cedar and Pine",
    facts: "Software · $10M-$20M",
    stage: "proposal",
    pitch: "Fractional VP Sales",
    monthly: 11000,
    way: "You know the CEO",
    to: "To Dana Whitfield, CEO · Email",
    next: "Check in on your proposal",
    due: "Due in 2 days",
    how: "From your proposal, on the day it goes out",
    paper: "Opened 2 times",
    log: [
      { d: "Day 2", t: "Dana opened it 2 times and read Pricing" },
      { d: "Day 1", t: "Sent. The signing link lasts 30 days" },
    ],
  }),
];

/** The board's deals with any example taken out: what counts, sends and moves read. */
export const realDeals = <T>(rows: readonly (T | Example<T>)[]) => realOnly(rows);

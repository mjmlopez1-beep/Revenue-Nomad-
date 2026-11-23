/**
 * The Seats page's own rules (Seats.dc.html), pure so scripts/test-seatspage.mts reads them as the
 * page does:
 *
 *   tabOf            which bottom tab a place is: All seats, Seats that ended lately, Your seats
 *   endedFilters     the filters of "Seats that ended lately" (endedWithin, model.ts), and back
 *   endedAt          when a seat ended, as Find reads it: its end month where on show, else when
 *                    Merlin recorded it as ended. Never a month the member hasn't opened.
 *   endedBand        how long ago, in the free words ("In the last 30 days"); the month costs 1 credit
 *   sortEnded        the ended list, the most recent end first
 *   verificationOf   a seat of the member's own: Verified, Waiting for a member, or With an admin
 *   earnedAt         what the member's credit history says they earned at a company, paid and waiting
 *   onFileUnderName  seats on file with the member's own name on them that aren't theirs yet:
 *                    Merlin's guesses that need no calendar (a name from public profiles)
 *   whenWords        "Feb to Dec 2024", "Since Jun 2026"
 */
import type { CoInfo, Filters, Row } from "../model";
import { isEndedSeat, shown } from "../model";
import type { EngagementRec, LedgerRow, Me } from "@/lib/tableTypes";

export type SeatTab = "all" | "ended" | "mine";
/** "Seats that ended lately": the last 90 days (3 months, as Find says it). */
export const ENDED_MONTHS = 3;

/** The tab for where the page sits: the page "seats" is Your seats; the table is All seats, or ended lately with its filter on. */
export const tabOf = (at: "data" | "mine", f: Pick<Filters, "endedWithin">): SeatTab => (at === "mine" ? "mine" : f.endedWithin > 0 ? "ended" : "all");

/** The filters for a data tab: ended lately sets the window, All seats takes it off. Every other filter stays. */
export const endedFilters = <F extends Pick<Filters, "endedWithin">>(f: F, tab: "all" | "ended"): F => ({ ...f, endedWithin: tab === "ended" ? ENDED_MONTHS : 0 });

const DAY = 86_400_000;

/** When a seat ended (ms), or null for a seat that hasn't. The end month where the member can see it, else when its newest fact was recorded. */
export function endedAt(e: EngagementRec): number | null {
  if (!isEndedSeat(e)) return null;
  const end = shown(e.cells.end);
  if (end) {
    const m = /^(\d{4})(?:-(\d{2}))?/.exec(end);
    if (m) return Date.UTC(Number(m[1]), m[2] ? Number(m[2]) - 1 : 11, 28);
  }
  const at = e.updatedAt ? Date.parse(e.updatedAt) : NaN;
  return Number.isFinite(at) ? at : null;
}

/** How long ago a seat ended, free to see: within 30, 60 or 90 days, or null past that (or not ended). */
export function endedBand(e: EngagementRec, now = Date.now()): string | null {
  const at = endedAt(e);
  if (at === null) return null;
  const days = Math.max(0, Math.floor((now - at) / DAY));
  if (days <= 30) return "In the last 30 days";
  if (days <= 60) return "31 to 60 days ago";
  if (days <= 92) return "61 to 90 days ago";
  return null;
}

/** The most recent end first; a seat with no end on file last. */
export function sortEnded(rows: readonly Row[]): Row[] {
  const at = (r: Row) => (r.e ? endedAt(r.e) : null) ?? -Infinity;
  return [...rows].sort((a, b) => at(b) - at(a) || a.key.localeCompare(b.key));
}

export interface Verification {
  word: "Verified" | "Waiting for a member" | "With an admin";
  sub: string;
  ok: boolean;
}

/** Sources that mean the seat holder published the work with Revenue Nomad. */
const PUBLISHED = ["Published engagement", "Member success story"];

/**
 * Where one of the member's own seats stands. Verified: the client confirmed it, two members confirmed
 * the name, it was matched to work the member published, or the member's own name matched the one on
 * file when they claimed it. With an admin: their claim on a name that isn't theirs as written. Else
 * it waits for another member to confirm a fact on it (with the credits that wait, when some do).
 */
export function verificationOf(e: EngagementRec, waitingCredits = 0): Verification {
  if (e.claimWaiting) return { word: "With an admin", sub: "Your name goes on it once they agree", ok: false };
  const op = e.cells.operator;
  const ver = op && op.s !== "empty" && op.s !== "reported" ? op.ver : 0;
  if (PUBLISHED.includes(e.source)) return { word: "Verified", sub: "Matched to work you published", ok: true };
  if (e.verified) return { word: "Verified", sub: "The company confirmed it", ok: true };
  if (ver >= 2) return { word: "Verified", sub: `${ver} members confirmed it`, ok: true };
  if (op?.s === "value" && op.iv) return { word: "Verified", sub: "Your name matched the one on file", ok: true };
  if (waitingCredits > 0) return { word: "Waiting for a member", sub: `New to Merlin. ${waitingCredits} ${waitingCredits === 1 ? "credit waits" : "credits wait"} until then`, ok: false };
  return { word: "Waiting for a member", sub: "Verified when a member confirms a fact", ok: false };
}

/** What the credit history says the member earned at a company: paid, and waiting to be confirmed. */
export function earnedAt(ledger: readonly LedgerRow[], company: string): { paid: number; waiting: number } {
  let paid = 0;
  let waiting = 0;
  for (const l of ledger) {
    if (l.company !== company || l.delta <= 0) continue;
    if (l.pending) waiting += l.delta;
    else paid += l.delta;
  }
  return { paid, waiting };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Seats on file whose holder's name, from public profiles and not verified, is the member's own name
 * as written, at a company they can see, that aren't theirs yet and have no claim waiting. Confirming
 * one is the same claim as Verify's "This is me". Nothing here is a guess from anywhere else.
 */
export function onFileUnderName(infos: readonly CoInfo[], me: Pick<Me, "name">): { i: CoInfo; e: EngagementRec }[] {
  const name = norm(me.name ?? "");
  if (name.split(" ").length < 2) return [];
  const out: { i: CoInfo; e: EngagementRec }[] = [];
  for (const i of infos) {
    if (i.c.hidden) continue;
    for (const e of i.engs) {
      const op = e.cells.operator;
      if (e.yours || e.claimWaiting || op?.s !== "value" || !op.unverified) continue;
      if (norm(op.v) === name) out.push({ i, e });
    }
  }
  return out;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2024-03" as "Mar 2024", "2024" as "2024". */
export const monthWords = (v: string | null | undefined) => {
  if (!v) return null;
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(v);
  if (!m) return v;
  return m[2] ? `${MON[Number(m[2]) - 1]} ${m[1]}` : m[1];
};

/** A seat's dates in a few words: "Feb to Dec 2024", "Mar 2023 to Jan 2024", "Since Jun 2026", or null. */
export function whenWords(e: EngagementRec): string | null {
  const start = shown(e.cells.start);
  const end = shown(e.cells.end);
  const s = monthWords(start);
  const status = shown(e.cells.status);
  if (!s) return end && end !== "Ongoing" ? `Ended ${monthWords(end)}` : status === "Active" ? "Active" : null;
  if (!end || end === "Ongoing" || status === "Active") return `Since ${s}`;
  const en = monthWords(end)!;
  const sy = start!.slice(0, 4);
  const ey = end.slice(0, 4);
  if (sy === ey && /\d{4}-\d{2}/.test(start!) && /\d{4}-\d{2}/.test(end)) return `${s.slice(0, 3)} to ${en}`;
  return `${s} to ${en}`;
}

/** "3 of 6": the step's place in Getting started, for the strip. */
export const stepWords = (keys: readonly string[], key: string) => {
  const n = keys.indexOf(key);
  return n < 0 ? null : `Step ${n + 1} of ${keys.length}`;
};

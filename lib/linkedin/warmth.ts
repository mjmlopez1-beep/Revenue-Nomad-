/**
 * How warm a LinkedIn tie is, from the member's own export: the counts of messages each way and
 * the first and last day (never what was said), and whether either recommended or endorsed the
 * other. Graded with Your network's own rules and words (lib/google/types.ts warmthFor, WARMTH_RULES,
 * STRENGTH_WORDS: Strong, Good, Fading, Cold), messages counting as emails do there, with one rule
 * added for a steady conversation: 12 or more messages both ways across at least four weeks, the
 * last in the past 60 days, is Strong (Hot), as 4 meetings over two months are.
 *
 * A recommendation either way is at least Good (they worked together); an endorsement alone is at
 * least Fading. Pure.
 */
import { warmthFor, whenWords, WARMTH_RANK, type Warmth } from "../google/types";
import type { WarmRow } from "./types";

const DAY = 86_400_000;
const at = (d: string) => Date.parse(`${d}T12:00:00Z`);
const best = (a: Warmth | null, b: Warmth | null): Warmth | null => (!a ? b : !b ? a : WARMTH_RANK[a] <= WARMTH_RANK[b] ? a : b);

export function messagesWarmth(w: Pick<WarmRow, "sent" | "received" | "first" | "last">, nowMs: number): Warmth {
  const total = w.sent + w.received;
  const both = w.sent > 0 && w.received > 0;
  const span = (at(w.last) - at(w.first)) / DAY;
  const days = (nowMs - at(w.last)) / DAY;
  if (both && total >= 12 && span >= 28 && days <= 60) return "Hot";
  return warmthFor({ emails: total, both, first: w.first, last: w.last }, nowMs);
}

/** "14 LinkedIn messages both ways, last Oct 3", "Recommended you on LinkedIn". */
export function tieWords(w: Pick<WarmRow, "sent" | "received" | "last"> | undefined, vouch: string | undefined, nowMs: number): string | null {
  const parts: string[] = [];
  if (w) {
    const n = w.sent + w.received;
    const when = whenWords(w.last, nowMs);
    parts.push(`${n} LinkedIn ${n === 1 ? "message" : "messages"}${w.sent && w.received ? " both ways" : ""}${when ? `, last ${when}` : ""}`);
  }
  const v = vouch ?? "";
  if (v.includes("r") && v.includes("R")) parts.push("You recommended each other on LinkedIn");
  else if (v.includes("r")) parts.push("Recommended you on LinkedIn");
  else if (v.includes("R")) parts.push("You recommended them on LinkedIn");
  else if (v.includes("e") || v.includes("E")) parts.push(v.includes("e") ? "Endorsed you on LinkedIn" : "You endorsed them on LinkedIn");
  return parts.length ? parts.join(" · ") : null;
}

/** The tie's warmth from its messages and vouches, or null with neither. */
export function tieWarmth(w: Pick<WarmRow, "sent" | "received" | "first" | "last"> | undefined, vouch: string | undefined, nowMs: number): Warmth | null {
  let out: Warmth | null = w ? messagesWarmth(w, nowMs) : null;
  const v = vouch ?? "";
  if (/[rR]/.test(v)) out = best(out, "Warm");
  else if (/[eE]/.test(v)) out = best(out, "Fading");
  return out;
}

const lc = (v: string) => v.toLowerCase().replace(/\s+/g, " ").trim();
/** The vouch map's key for a connection: its profile link, else its exact name and company. */
export const vouchKey = (r: { u?: string; f: string; l: string; c?: string }) => (r.u ? r.u : `n:${lc(r.f)} ${lc(r.l)}|${lc(r.c ?? "")}`);

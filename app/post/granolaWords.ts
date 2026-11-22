/**
 * How a Granola call reads in the picker: "Today's call with Dana, 10:00", and under it
 * "Granola has a 42-minute call from today with dana@cedarpine.example." Times are the member's
 * own (the browser's time zone). Pure, for scripts/test-granola.mts.
 */
import type { GranolaCall } from "@/lib/granola/types";

const DAY = 86_400_000;
const localDay = (ms: number) => {
  const d = new Date(ms);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};
const daysAgo = (iso: string, nowMs: number) => Math.round((localDay(nowMs) - localDay(Date.parse(iso))) / DAY);
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dateOf = (iso: string, nowMs: number) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() !== new Date(nowMs).getFullYear() ? { year: "numeric" } : {}) });
};

/** The person a call is with, as the picker names them: the first matching attendee's first name, else their email. */
export function whoOf(c: Pick<GranolaCall, "with" | "more">): string {
  const p = c.with[0];
  if (!p) return "";
  const first = p.name.trim().split(/\s+/)[0];
  const others = c.with.length - 1 + c.more;
  return `${first || p.email}${others > 0 ? ` and ${others} other${others === 1 ? "" : "s"}` : ""}`;
}

/** "Today's call with Dana, 10:00", "Yesterday's call with Dana, 15:30", "Monday's call…", "Call with Dana on Nov 2, 10:00". */
export function callTitle(c: GranolaCall, nowMs = Date.now()): string {
  const who = whoOf(c);
  const withWho = who ? ` with ${who}` : "";
  const n = daysAgo(c.when, nowMs);
  const t = timeOf(c.when);
  if (n <= 0) return `Today’s call${withWho}, ${t}`;
  if (n === 1) return `Yesterday’s call${withWho}, ${t}`;
  if (n < 7) return `${new Date(c.when).toLocaleDateString("en-US", { weekday: "long" })}’s call${withWho}, ${t}`;
  return `Call${withWho} on ${dateOf(c.when, nowMs)}, ${t}`;
}

/** "Granola has a 42-minute call from today with dana@cedarpine.example." */
export function callLine(c: GranolaCall, nowMs = Date.now()): string {
  const n = daysAgo(c.when, nowMs);
  const from = n <= 0 ? "today" : n === 1 ? "yesterday" : `${dateOf(c.when, nowMs)}`;
  const emails = c.with.slice(0, 2).map((p) => p.email);
  const extra = c.with.length - emails.length + c.more;
  const withWho = emails.length ? ` with ${emails.join(" and ")}${extra > 0 ? ` and ${extra} more` : ""}` : "";
  const m = c.minutes;
  const a = m && (String(m).startsWith("8") || m === 11 || m === 18) ? "an" : "a";
  return `Granola has ${a} ${m ? `${m}-minute ` : ""}call from ${from}${withWho}.`;
}

/** "42 minutes", for onPick's caller. */
export const minutesWords = (m: number | null) => (m ? `${m} minute${m === 1 ? "" : "s"}` : "");

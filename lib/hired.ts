/**
 * "Recently hired": companies that hired a fractional in a function within the last few months.
 * Pure functions, no Node imports. The table (app/post/model.ts), the weekly email (lib/digest.ts),
 * alerts in Slack (lib/notify) and the connector (lib/mcp/tools.ts) all read these rules.
 *
 * The rules, as members read them:
 * - A hire is any seat that counts as one: a fractional, interim, advisory or project seat, or one
 *   with no type on file. Not a full-time seat, not an open role, and not a job posting that came
 *   down with nobody named in the seat (isHire in app/post/model.ts).
 * - Recently hired leaves out a seat whose status is Ended (isRecentHire in app/post/model.ts): the
 *   fractional has left, so it is no recent hire, whenever it started. It still counts everywhere
 *   else a hire does (Functions hired, repeat hirers, fractional friendly, the benchmarks).
 * - Only a fractional leader's seat counts here: C-level, VP, Head, Director, Lead, or a title that
 *   shows no level. A seat whose title reads below Lead ("Fractional Finance Manager", "Fractional
 *   Content Engineer") doesn't (isLeaderHire in app/post/model.ts). The server reads the stored
 *   title, seen or not, and sends only a flag (EngagementRec.belowLead). Everywhere else, Functions
 *   hired, repeat hirers and the benchmarks, every hire still counts.
 * - "In the last N months" reads the hire's start month: it counts when it is at most N months
 *   before this month. With 6 in November, May to November count (and any later month).
 * - A start with only a year counts as that year's December: "2025" reads as Dec 2025.
 * - 0 months is any time: every hire counts, one with no start on file too.
 * - A company matches when it has a hire in one of the functions picked (any function when none
 *   is picked) that counts for the window.
 */

/** The windows the app offers, in months. 0 is any time. */
export const HIRED_WINDOWS = [3, 6, 12, 24, 0] as const;
/** The window "Recently hired" opens on. */
export const HIRED_DEFAULT_WINDOW = 6;
/** The longest window a link or the connector may ask for (20 years). */
export const HIRED_MAX_WINDOW = 240;

/** A window from loose input (a link, the connector): a whole number of months from 0 to 240, else 0 (any time). */
export function cleanWindow(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(HIRED_MAX_WINDOW, Math.round(n));
}

/** "6 months", "12 months", "any time". */
export const windowWords = (months: number) => (months > 0 ? `${months} ${months === 1 ? "month" : "months"}` : "any time");
/** "in the last 6 months", or "at any time". */
export const windowPhrase = (months: number) => (months > 0 ? `in the last ${windowWords(months)}` : "at any time");

/**
 * The month a start stands for, as "YYYY-MM": "2025-03" stays, a year alone ("2025") is its
 * December ("2025-12"). Null for anything else. The one reading of a start everywhere a seat's
 * recency counts: Recently hired here, and the "Recent seat" tag on the server (lib/table.ts
 * friendliness) and in the app (app/post/model.ts recentSeats), through startMs below.
 */
export function hireMonth(start: string | null | undefined): string | null {
  const m = /^\s*(\d{4})(?:-(\d{1,2}))?\s*$/.exec(String(start ?? ""));
  if (!m) return null;
  const mo = m[2] === undefined ? 12 : Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  return `${m[1]}-${String(mo).padStart(2, "0")}`;
}

/** The first day of the month a start stands for (a year alone is its December), in ms, or NaN. */
export function startMs(start: string | null | undefined): number {
  const ym = hireMonth(start);
  return ym ? Date.parse(`${ym}-01T00:00:00Z`) : NaN;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A start as words, for the email and Slack: "2026-03" is "Mar 2026", a year alone stays "2025". "" for anything else. */
export function startWords(start: unknown): string {
  const m = /^\s*(\d{4})(?:-(\d{1,2}))?\s*$/.exec(String(start ?? ""));
  if (!m) return "";
  if (m[2] === undefined) return m[1];
  const mo = Number(m[2]);
  return mo >= 1 && mo <= 12 ? `${MONTHS[mo - 1]} ${m[1]}` : "";
}

/** Whole months from `ym` ("YYYY-MM") to the month of `now`: 0 this month, 1 last month, below 0 for a later month. */
export function monthsAgo(ym: string, now: number | Date = Date.now()): number {
  const d = typeof now === "number" ? new Date(now) : now;
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  return d.getFullYear() * 12 + d.getMonth() - (y * 12 + (m - 1));
}

/** A hire with this start counts for a window of `months` (0: any time, an unknown start too). */
export function inWindow(start: string | null | undefined, months: number, now: number | Date = Date.now()): boolean {
  if (!(months > 0)) return true;
  const ym = hireMonth(start);
  return !!ym && monthsAgo(ym, now) <= months;
}

/** The functions a sentence can name: "Executive" and "Other" are catch-alls, so they read as "a fractional leader". */
const named = (fns: readonly (string | null | undefined)[] | undefined) => (fns ?? []).filter((f): f is string => !!f && f !== "Other" && f !== "Executive");

/** "Finance", "Finance or Sales", "Finance, Sales or People". Empty when none can be named. */
export function fnList(fns: readonly (string | null | undefined)[]): string {
  const xs = [...new Set(named(fns))];
  return xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`;
}

/** "a fractional Finance leader", "a fractional Finance or Sales leader", "a fractional leader". */
export const fnLeader = (fns: readonly (string | null | undefined)[]) => {
  const xs = fnList(fns);
  return xs ? `a fractional ${xs} leader` : "a fractional leader";
};

const TYPE_WORD = /^(fractional|interim|part[- ]time|outsourced|contract|freelance|advisory)\b[\s,:-]*/i;
const an = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");

/**
 * Who a hire was, for "Hired a fractional CFO": the role title when the viewer can see it, else
 * the function ("a fractional Finance leader"). A title that starts with its own kind of work keeps
 * it ("an interim CFO"), so it never reads "a fractional Fractional CFO".
 */
export function hireWhat(role: string | null | undefined, fn: string | null | undefined): string {
  const r = String(role ?? "").replace(/\s+/g, " ").trim();
  const m = r ? TYPE_WORD.exec(r) : null;
  // A title that is only the kind of work ("Fractional") says nothing the function doesn't.
  if (!r || (m && r.length <= m[0].length)) return fnLeader([fn]);
  if (m) {
    const word = m[1].toLowerCase().replace(" ", "-");
    return `${an(word)} ${word} ${r.slice(m[0].length)}`;
  }
  return `a fractional ${r}`;
}

/**
 * The weekly email's and Slack's line for a saved view that follows hires:
 * "2 companies in your profile hired a fractional Finance leader this week".
 */
export function hiresLine(n: number, fns: readonly string[], inProfile: boolean, added = false): string {
  const k = Math.max(0, Math.round(n));
  // `added` (the weekly email): the hire came onto Merlin this week, and may have started months before.
  if (added) return `${k} ${k === 1 ? "company" : "companies"}${inProfile ? " in your profile" : ""} that hired ${fnLeader(fns)}, added this week`;
  return `${k} ${k === 1 ? "company" : "companies"}${inProfile ? " in your profile" : ""} hired ${fnLeader(fns)} this week`;
}

/** A saved view that follows hires (its criteria name hire functions or a window), not open roles. */
export const followsHires = (c: { hiredFn?: readonly string[] | null; hiredWithin?: number | null } | null | undefined) =>
  !!c && ((Array.isArray(c.hiredFn) && c.hiredFn.length > 0) || (typeof c.hiredWithin === "number" && c.hiredWithin > 0));

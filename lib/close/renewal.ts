/**
 * Renewals, pure: when a signed engagement's term ends, when the member is reminded (RENEW_DAYS
 * before), and the fields of the new draft "Start the renewal" makes (the same proposal, its dates
 * moved forward by one term).
 *
 * The end comes from the signed proposal's own fields: term.endDate when it has one, else the
 * start (term.startDate or start.date, else the day it was signed) plus term.initialMonths. With
 * neither, the member is asked once on the signed proposal (lib/close/server.ts setRenewalEnd).
 */

const DAY = 86_400_000;
export const RENEW_DAYS = 30;

/** A date as the member typed it ("June 1, 2027", "2027-06-01"): its day, as YYYY-MM-DD, or null. */
export function dayOfText(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const ms = iso ? Date.UTC(+iso[1], +iso[2] - 1, +iso[3]) : Date.parse(`${t} UTC`);
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (d.getUTCFullYear() < 2000 || d.getUTCFullYear() > 2100) return null;
  return d.toISOString().slice(0, 10);
}

/** A day plus some months, the day kept where the month has it (Jan 31 + 1 month is Feb 28). */
export function addMonths(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

const monthsOf = (f: Record<string, string>): number | null => {
  const n = Number(String(f["term.initialMonths"] ?? "").replace(/[^\d.]/g, ""));
  return Number.isInteger(n) && n > 0 && n <= 60 ? n : null;
};

/** The term's end (YYYY-MM-DD) from a signed proposal's fields, or null when they don't say. */
export function termEndOf(f: Record<string, string>, signedAt: string): string | null {
  const end = dayOfText(f["term.endDate"]);
  if (end) return end;
  const months = monthsOf(f);
  if (!months) return null;
  const start = dayOfText(f["term.startDate"]) ?? dayOfText(f["start.date"]) ?? signedAt.slice(0, 10);
  return addMonths(start, months);
}

/** Days from now to the end (negative once it passed). */
export const daysTo = (end: string, nowMs: number) => Math.ceil((Date.parse(`${end}T00:00:00Z`) - nowMs) / DAY);

/** The renewal reminder is due: RENEW_DAYS or fewer to go, not more than 7 days past. */
export const renewalDue = (end: string | null | undefined, nowMs: number) => !!end && daysTo(end, nowMs) <= RENEW_DAYS && daysTo(end, nowMs) >= -7;

const fmt = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
/** "May 31". */
export const shortDay = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/**
 * The renewal draft's fields: the date it is prepared, and the term moved on by one term (the new
 * one starts the day after the old one ends). What the member typed elsewhere stays as it was.
 */
export function renewalFields(f: Record<string, string>, end: string, nowMs: number): Record<string, string> {
  const out = { ...f };
  const months = monthsOf(f);
  const start = addDays(end, 1);
  out["proposal.date"] = fmt(new Date(nowMs).toISOString().slice(0, 10));
  if (f["term.startDate"]) out["term.startDate"] = fmt(start);
  if (f["start.date"]) out["start.date"] = fmt(start);
  if (f["term.endDate"]) {
    const oldStart = dayOfText(f["term.startDate"]) ?? dayOfText(f["start.date"]);
    const span = months ?? (oldStart ? Math.max(1, Math.round((Date.parse(end) - Date.parse(oldStart)) / (30.44 * DAY))) : 12);
    out["term.endDate"] = fmt(addMonths(start, span));
  }
  return out;
}

/** "You're on Operator at $12,000 a month." from the signed fields and the option picked, when known. */
export function termsLine(f: Record<string, string>, option: string | null): string | null {
  const fee = String(f["pricing.monthlyFee"] ?? "").trim();
  if (option && fee) return `You're on ${option} at ${fee} a month.`;
  if (fee) return `You're at ${fee} a month.`;
  if (option) return `You're on ${option}.`;
  return null;
}

/**
 * The credits meter: one honest number, "N% of your credits left", the way Claude shows usage.
 * Pure: no state of its own, no clock, no env. lib/table.ts feeds it the ledger and the plan
 * (Me.meter), the connector adds its line after a spend (lib/mcp/log.ts), and the bell says it
 * once a period at 80% used and at 0 (lib/table.ts perform). scripts/test-meter.mts checks it.
 *
 *   Period   since the member's latest monthly plan grant (ledger reason "plan", PRO_CREDITS on
 *            Pro and Close) while they are on a paid plan; else since the start of the UTC
 *            calendar month (Free, the trial, billing off). A grant older than STALE_GRANT_DAYS
 *            is no period of its own (a yearly plan whose month has not been granted yet): the
 *            calendar month then.
 *   Spent    credits the member's unlocks spent in the period, less refunds in it (never below 0).
 *   Left     balance / (balance + spent), a whole percent: 100 when nothing was spent, 0 at a
 *            balance of 0. Anything left reads at least 1%, anything spent at most 99%.
 *
 * It encourages use: the words never ask a member to use less. At LOW_PCT or below (or at 0) they
 * say how to get more: a top-up, or a plan with monthly credits.
 */
import { PRICES, PRO_CREDITS, TOPUP_CREDITS, addMonths, monthsBetween } from "./billing/rules";

/** At or below this share left, the meter is low: the top-up and the upgrade show. */
export const LOW_PCT = 20;
/** The bell's line comes once a period when this share is used. */
export const BELL_USED_PCT = 80;
/** A plan grant older than this is not the period's start (the calendar month is). */
export const STALE_GRANT_DAYS = 35;
const DAY = 86_400_000;

/** The ledger rows the meter reads. */
export interface MeterRow {
  memberId: string;
  delta: number;
  reason: string;
  at: string;
}

/** Me.meter. Dates are ISO. */
export interface CreditsMeter {
  /** Whole percent of this period's credits left. */
  leftPct: number;
  /** Credits to spend now (never below 0). */
  balance: number;
  /** Credits spent in the period (unlocks, less refunds). */
  spent: number;
  /** When the period started. */
  since: string;
  /** "plan": since the latest monthly grant; "month": since the start of the UTC month. */
  basis: "plan" | "month";
  /** When the period ends: the next grant, or the start of next UTC month. */
  resetsAt: string;
  /** When the next PRO_CREDITS come, when known (a paid plan that renews). Null otherwise. */
  nextGrantAt: string | null;
  /** At LOW_PCT or below, or nothing left: the top-up and the upgrade show. */
  low: boolean;
}

const monthStart = (nowMs: number) => {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
};
const nextMonthStart = (nowMs: number) => {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
};

/** The period: since the latest plan grant on a paid plan (within STALE_GRANT_DAYS), else the UTC month. */
export function meterPeriod(rows: readonly MeterRow[], memberId: string, nowMs: number, onPaidPlan: boolean): { since: string; basis: "plan" | "month" } {
  if (onPaidPlan) {
    let last = NaN;
    for (const l of rows) {
      if (l.memberId !== memberId || l.reason !== "plan" || l.delta <= 0) continue;
      const at = Date.parse(l.at);
      if (at <= nowMs && !(at <= last)) last = at;
    }
    if (Number.isFinite(last) && nowMs - last <= STALE_GRANT_DAYS * DAY) return { since: new Date(last).toISOString(), basis: "plan" };
  }
  return { since: new Date(monthStart(nowMs)).toISOString(), basis: "month" };
}

/** Credits spent since `since` (unlocks less refunds, never below 0). */
export function spentSince(rows: readonly MeterRow[], memberId: string, sinceIso: string, nowMs: number): number {
  const from = Date.parse(sinceIso);
  let n = 0;
  for (const l of rows) {
    if (l.memberId !== memberId) continue;
    const at = Date.parse(l.at);
    if (!(at >= from) || at > nowMs) continue;
    if (l.reason === "unlock" && l.delta < 0) n -= l.delta;
    else if (l.reason === "refund" && l.delta > 0) n -= l.delta;
  }
  return Math.max(0, n);
}

/** balance / (balance + spent), a whole percent: 0 at no balance, 100 when nothing was spent, else 1 to 99. */
export function leftPctOf(balance: number, spent: number): number {
  if (balance <= 0) return 0;
  if (spent <= 0) return 100;
  return Math.min(99, Math.max(1, Math.round((100 * balance) / (balance + spent))));
}

/** The plan's parts that say when the next grant comes (lib/plan.ts PlanRecord). */
export interface GrantPlan {
  interval?: "month" | "year";
  periodStart?: string;
  proUntil?: string;
  cancelAt?: string;
  pausedFrom?: string;
  pausedUntil?: string;
}

/**
 * When the next PRO_CREDITS come on a paid plan: a monthly plan's next invoice (proUntil), a yearly
 * plan's next month from its period start (the renewal after the twelfth). Null when it will not
 * come: cancelled, or a pause booked before it.
 */
export function nextGrantOf(rec: GrantPlan | undefined, nowMs: number): string | null {
  if (!rec?.periodStart) return null;
  const until = Date.parse(rec.proUntil ?? "");
  let next: number;
  if (rec.interval === "year") {
    const k = monthsBetween(rec.periodStart, nowMs);
    next = k + 1 <= 11 ? Date.parse(addMonths(rec.periodStart, k + 1)) : until;
  } else next = until;
  if (!Number.isFinite(next) || next <= nowMs) return null;
  // The renewal: only while it renews (not cancelled, no pause from then).
  if (next >= until) {
    if (rec.cancelAt) return null;
    const pf = Date.parse(rec.pausedFrom ?? "");
    if (Number.isFinite(pf) && pf <= next) return null;
  }
  return new Date(next).toISOString();
}

/** The meter for one member. `onPaidPlan`: on Pro or Close now (lib/plan.ts planOf "pro"). */
export function creditsMeterOf(o: { rows: readonly MeterRow[]; memberId: string; balance: number; nowMs: number; onPaidPlan: boolean; plan?: GrantPlan }): CreditsMeter {
  const { since, basis } = meterPeriod(o.rows, o.memberId, o.nowMs, o.onPaidPlan);
  const spent = spentSince(o.rows, o.memberId, since, o.nowMs);
  const balance = Math.max(0, o.balance);
  const leftPct = leftPctOf(balance, spent);
  const nextGrantAt = o.onPaidPlan ? nextGrantOf(o.plan, o.nowMs) : null;
  const resetsAt = nextGrantAt ?? (basis === "plan" ? addMonths(since, 1) : new Date(nextMonthStart(o.nowMs)).toISOString());
  return { leftPct, balance, spent, since, basis, resetsAt, nextGrantAt, low: balance <= 0 || leftPct <= LOW_PCT };
}

/* ---------- the words ---------- */

const credits = (n: number) => `${n} credit${n === 1 ? "" : "s"}`;
/** "N% of your credits left" (the meter's own line, the app and the connector). */
export const leftWords = (m: Pick<CreditsMeter, "leftPct">) => `${m.leftPct}% of your credits left`;

/** What the member can buy, for the words: their plan (null while billing is off) and whether the top-up is set up. */
export interface BuyCtx {
  plan: "free" | "trial" | "pro" | null;
  topup: boolean;
}

/** How to get more, in one sentence (no link): a top-up, or a plan with monthly credits. Earning while billing is off. */
export function getMoreWords(b: BuyCtx): string {
  const top = `top up ${TOPUP_CREDITS} credits for $${PRICES.topup}`;
  const pro = `move to Pro for ${PRO_CREDITS} credits each month`;
  if (!b.plan) return "To get more, add what you know on Merlin: each fact earns a credit.";
  if (b.plan === "pro") return b.topup ? `To keep going, ${top}.` : "To keep going, see your plan on Merlin.";
  return b.topup ? `To keep going, ${top}, or ${pro}.` : `To keep going, ${pro}.`;
}

/**
 * The connector's line after a call that spent credits: "12 credits left (60% of this month's)."
 * Low (LOW_PCT or below, or 0 left): how to get more, with the link (`link`: the billing page,
 * or the credits page while billing is off).
 */
export function connectorLine(m: CreditsMeter, b: BuyCtx, link: string): string {
  const base = `${credits(m.balance)} left (${m.leftPct}% of this month's).`;
  return m.low ? `${base} ${getMoreWords(b)} ${link}` : base;
}

/** What the bell already said this period (Profile.meterBell): the period's start and the marks told. */
export interface MeterBellMark {
  since: string;
  told: ("80" | "0")[];
}

/** One bell line (lib/inbox.ts InboxEntry without read). */
export interface MeterBellLine {
  id: string;
  at: string;
  kind: "credits";
  line: string;
  sub?: string;
  href: string;
  alert: string;
}

/** Where a bell line opens: Credits and usage, Plans (Ways to earn while billing is off). */
export const meterHref = (b: BuyCtx) => (b.plan ? "/?p=billing&plans=1" : "/?p=credits&tab=earn");

/**
 * The bell's lines for the meter now, at most once each a period: "You've used 80% of this month's
 * credits" when the share left reaches 100 - BELL_USED_PCT, and "You've used all ..." at 0. Only
 * after a spend in the period. Hitting 0 at once says only the 0 line (and marks both). Returns the
 * lines to add and the mark to keep (null when nothing changed).
 */
export function meterBell(m: CreditsMeter, mark: MeterBellMark | undefined, b: BuyCtx, nowIso: string): { lines: MeterBellLine[]; mark: MeterBellMark | null } {
  if (m.spent <= 0) return { lines: [], mark: null };
  const told = new Set(mark?.since === m.since ? mark.told : []);
  const at80 = m.leftPct <= 100 - BELL_USED_PCT;
  const at0 = m.balance <= 0;
  const want: ("80" | "0")[] = [];
  if (at0 && !told.has("0")) want.push("0");
  else if (at80 && !told.has("80") && !at0) want.push("80");
  if (!want.length) return { lines: [], mark: null };
  const cta = !b.plan ? "Earn more by adding what you know" : b.plan === "pro" ? (b.topup ? "Top up for more" : "See your plan") : "Top up or upgrade";
  const next = m.nextGrantAt ? `Your next ${PRO_CREDITS} credits come ${new Date(m.nextGrantAt).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}.` : "";
  const lines: MeterBellLine[] = want.map((k) => ({
    id: `credits:${k}:${m.since}`,
    at: nowIso,
    kind: "credits",
    line: k === "0" ? `You've used all of this month's credits · ${cta}` : `You've used ${BELL_USED_PCT}% of this month's credits · ${cta}`,
    sub: k === "0" ? next || "Credits and usage" : [`${credits(m.balance)} left`, next].filter(Boolean).join(". "),
    href: meterHref(b),
    alert: "credits",
  }));
  // At 0 the 80% line has nothing left to say: both are told.
  for (const k of want) told.add(k);
  if (want.includes("0")) told.add("80");
  return { lines, mark: { since: m.since, told: (["80", "0"] as const).filter((k) => told.has(k)) } };
}

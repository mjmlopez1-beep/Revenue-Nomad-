import type { Database, EarnAction, CreditEntry, Operator } from "./types";
import { uid } from "./store";
import { isoWeek, weeksAgo, monthKey, quarterKey } from "./time";

/**
 * Credit economy. Three inviolable rules (spec §1):
 *  1. Credits never affect buyer matching — nothing here touches matching.
 *  2. Individual data never shown — credits are personal, aggregates elsewhere.
 *  3. Each question pays once — callers enforce uniqueness (one pulse per
 *     week, one actuals entry per client, one answer per question); this
 *     module enforces caps and applies the streak multiplier.
 */

export function balance(db: Database, operatorId: string, now: Date = new Date()): number {
  let sum = 0;
  for (const e of db.credits) {
    if (e.operatorId !== operatorId) continue;
    if (e.amount > 0 && e.expiresAt && new Date(e.expiresAt) < now) continue;
    sum += e.amount;
  }
  return Math.max(0, Math.round(sum));
}

/** Count of credit-earning contributions in the current quarter (status tier). */
export function contributionsThisQuarter(db: Database, operatorId: string, now: Date = new Date()): number {
  const q = quarterKey(now);
  return db.credits.filter(
    (e) =>
      e.operatorId === operatorId &&
      e.amount > 0 &&
      e.action !== "insider_monthly" &&
      e.action !== "streak_multiplier" &&
      e.action !== "admin_adjustment" &&
      quarterKey(new Date(e.at)) === q
  ).length;
}

/**
 * Streak: N consecutive weekly pulses (weeks ending with last week) earns a
 * multiplier on credits earned "next month" — implemented as: multiplier is
 * active while the trailing N full weeks before the current week all have a
 * pulse. Weekly is the streak unit, never daily (spec §4).
 */
export function streakWeeks(db: Database, operatorId: string, now: Date = new Date()): number {
  let streak = 0;
  for (let i = 1; i <= 26; i++) {
    const wk = isoWeek(weeksAgo(i, now));
    if (db.pulseResponses.some((p) => p.operatorId === operatorId && p.week === wk)) streak++;
    else break;
  }
  return streak;
}

export function multiplierActive(db: Database, operatorId: string, now: Date = new Date()): boolean {
  return streakWeeks(db, operatorId, now) >= db.config.streak.weeks;
}

export interface AwardResult {
  entry: CreditEntry;
  amount: number;
  multiplied: boolean;
}

/** Append an earn entry, applying the streak multiplier when active. */
export function award(
  db: Database,
  operatorId: string,
  action: EarnAction,
  baseAmount: number,
  ref: string,
  note: string,
  opts: { expiresAt?: string | null; noMultiplier?: boolean; at?: string } = {}
): AwardResult {
  const multiplied = !opts.noMultiplier && multiplierActive(db, operatorId, opts.at ? new Date(opts.at) : new Date());
  const amount = Math.round(baseAmount * (multiplied ? db.config.streak.multiplier : 1));
  const entry: CreditEntry = {
    id: uid("cr"),
    operatorId,
    action,
    amount,
    ref,
    note,
    at: opts.at ?? new Date().toISOString(),
    expiresAt: opts.expiresAt ?? null,
  };
  db.credits.push(entry);
  return { entry, amount, multiplied };
}

export function spend(db: Database, operatorId: string, amount: number, ref: string, note: string): CreditEntry {
  const entry: CreditEntry = {
    id: uid("cr"),
    operatorId,
    action: "spend",
    amount: -Math.abs(amount),
    ref,
    note,
    at: new Date().toISOString(),
    expiresAt: null,
  };
  db.credits.push(entry);
  return entry;
}

/* ---------- cap checks (callers consult before awarding) ---------- */

export function dealsThisWeek(db: Database, operatorId: string, now: Date = new Date()): number {
  const wk = isoWeek(now);
  return db.deals.filter((d) => d.operatorId === operatorId && d.week === wk).length;
}

export function signalsThisMonth(db: Database, operatorId: string, now: Date = new Date()): number {
  const m = monthKey(now);
  return db.signals.filter((s) => s.operatorId === operatorId && monthKey(new Date(s.at)) === m).length;
}

export function pastEngagementCount(db: Database, operatorId: string): number {
  return db.clients.filter((c) => c.operatorId === operatorId && c.status === "past").length;
}

export function toolReviewCount(db: Database, operatorId: string): number {
  return db.toolReviews.filter((r) => r.operatorId === operatorId).length;
}

export function inLaunchWindow(db: Database, now: Date = new Date()): boolean {
  const launch = new Date(db.config.launchDate + "T00:00:00Z");
  return now.getTime() - launch.getTime() <= db.config.earn.launchWindowDays * 86400000;
}

/** Insider tier grants monthly credits — idempotent per month. */
export function grantInsiderMonthly(db: Database, op: Operator, now: Date = new Date()): void {
  if (!op.insider) return;
  const m = monthKey(now);
  const already = db.credits.some(
    (e) => e.operatorId === op.id && e.action === "insider_monthly" && e.ref === m
  );
  if (already) return;
  award(db, op.id, "insider_monthly", db.config.insider.monthlyCredits, m, `Insider monthly credits (${m})`, {
    noMultiplier: true,
  });
}

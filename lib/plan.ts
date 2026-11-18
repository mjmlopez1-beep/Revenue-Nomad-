/**
 * A member's plan: Free, Pro trial, or Pro. The one place that answers "is this member on Pro
 * right now", so billing (lib/billing) and the radar (lib/radar) agree.
 *
 * Paid plans only exist while billing is switched on (RN_BILLING=1). With it off, nobody is on a
 * trial or Pro and every member keeps today's free product: nothing is gated.
 *
 * Pure: no state, no clock of its own. The stored record lives in State.billing.members[memberId]
 * (lib/table.ts); pass it in with the time.
 */

export type PlanName = "free" | "trial" | "pro";

/** What billing stores for one member. Every field optional: a member with no record is on Free. */
export interface PlanRecord {
  /** The reverse trial: when it started and when it ends (ISO). Started when onboarding is done. */
  trialStartedAt?: string;
  trialEndsAt?: string;
  /** The trial was extended once (value was happening when it was about to end). */
  trialExtended?: boolean;
  /** Paid Pro: the end of the period paid for (ISO). Renewals move it forward. */
  proUntil?: string;
  /** "month" | "year", for the billing page. */
  interval?: "month" | "year";
  /** Set when the member cancelled: Pro runs to proUntil, then Free. */
  cancelAt?: string;
  /** Paused (book full): no charge and Free until this date, then Pro resumes. */
  pausedUntil?: string;
  /** Stripe ids. Never sent to the browser. */
  customerId?: string;
  subscriptionId?: string;
}

export const billingOn = (): boolean => process.env.RN_BILLING === "1";

export function planOf(rec: PlanRecord | undefined, nowMs: number): PlanName {
  if (!billingOn() || !rec) return "free";
  const t = (iso?: string) => (iso ? Date.parse(iso) : NaN);
  if (Number.isFinite(t(rec.pausedUntil)) && nowMs < t(rec.pausedUntil)) return "free";
  if (Number.isFinite(t(rec.proUntil)) && nowMs < t(rec.proUntil)) return "pro";
  if (Number.isFinite(t(rec.trialEndsAt)) && nowMs < t(rec.trialEndsAt)) return "trial";
  return "free";
}

/** Pro and the trial get the same product. */
export const hasPro = (rec: PlanRecord | undefined, nowMs: number): boolean => planOf(rec, nowMs) !== "free";

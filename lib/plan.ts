/**
 * A member's plan: Free, Pro trial, or Pro. The one place that answers "is this member on Pro
 * right now", so billing (lib/billing) and the radar (lib/radar, instant delivery for Pro) agree.
 *
 * Paid plans only exist while billing is switched on (RN_BILLING=1). With it off, nobody is on a
 * trial or Pro and every member keeps today's free product: nothing is gated.
 *
 * Billing also needs Stripe (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTH,
 * STRIPE_PRICE_YEAR): billingLive() is RN_BILLING=1 with those set. Only then do trials start and
 * the Free limits apply (gated). RN_BILLING=1 without Stripe behaves as billing off.
 *
 * Pure: no state, no clock of its own. The stored record lives in State.billing.members[memberId]
 * (lib/table.ts); pass it in with the time.
 *
 * For anything that has a Free and a Pro form (saved views, benchmarks, the Claude connector):
 *   gated(rec, nowMs)        true: show the Free form. Never true while billing isn't live. The radar has no
 *                            Free form: every member gets every signal; Pro gets them at once (hasPro).
 *   upgradeUrl(base, from)   where an upgrade link goes: the app's Plan and billing page with the plans open.
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
  /** When the pause starts (the end of the period already paid for). Before it the member keeps Pro. Absent: from the start. */
  pausedFrom?: string;
  /** Stripe ids. Never sent to the browser. */
  customerId?: string;
  subscriptionId?: string;
  /** The first time Pro was paid for (ISO): the trial turned into a paid plan. */
  paidSince?: string;
  /** The last paid invoice (Stripe id) and the start of the period it paid for, for the monthly credits. */
  invoiceId?: string;
  periodStart?: string;
  /** What the plan costs per interval, in cents (from Stripe), for MRR. */
  cents?: number;
  /** Notices already sent, by kind ("trial3", "trialLast", "trialEnd"), with when. */
  notices?: Record<string, string>;
}

export const billingOn = (): boolean => process.env.RN_BILLING === "1";

/** Stripe is set up: the secret key, the webhook secret and both Pro prices. */
export const stripeReady = (): boolean =>
  ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_MONTH", "STRIPE_PRICE_YEAR"].every((k) => !!process.env[k]?.trim());

/** Billing is switched on and can take money: trials start and the Free limits apply. */
export const billingLive = (): boolean => billingOn() && stripeReady();

const t = (iso?: string) => (iso ? Date.parse(iso) : NaN);

/** Inside a pause now (after its start, before its end). */
export const pausedAt = (rec: PlanRecord | undefined, nowMs: number): boolean =>
  !!rec && Number.isFinite(t(rec.pausedUntil)) && nowMs < t(rec.pausedUntil) && !(Number.isFinite(t(rec.pausedFrom)) && nowMs < t(rec.pausedFrom));

export function planOf(rec: PlanRecord | undefined, nowMs: number): PlanName {
  if (!billingOn() || !rec) return "free";
  if (pausedAt(rec, nowMs)) return "free";
  if (Number.isFinite(t(rec.proUntil)) && nowMs < t(rec.proUntil)) return "pro";
  if (Number.isFinite(t(rec.trialEndsAt)) && nowMs < t(rec.trialEndsAt)) return "trial";
  return "free";
}

/** Pro and the trial get the same product. */
export const hasPro = (rec: PlanRecord | undefined, nowMs: number): boolean => planOf(rec, nowMs) !== "free";

/** The member sees the Free form of something Pro has more of. Never while billing isn't live: then nothing is gated. */
export const gated = (rec: PlanRecord | undefined, nowMs: number): boolean => billingLive() && !hasPro(rec, nowMs);

/** Whole days left in the trial (1 on its last day), or null when not on a trial. */
export function trialDaysLeft(rec: PlanRecord | undefined, nowMs: number): number | null {
  if (planOf(rec, nowMs) !== "trial") return null;
  return Math.max(1, Math.ceil((t(rec!.trialEndsAt) - nowMs) / 86_400_000));
}

/** The app's Plan and billing page, with the plans open. `from` says which upgrade moment sent them. */
export const UPGRADE_PATH = "/?p=billing&plans=1";
export const upgradeUrl = (base: string, from: string): string =>
  `${base.replace(/\/$/, "")}${UPGRADE_PATH}&from=${encodeURIComponent(from.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40) || "app")}`;

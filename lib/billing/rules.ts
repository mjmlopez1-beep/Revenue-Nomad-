/**
 * Merlin's payment model, as pure rules: the reverse trial, its one extension, pause, cancel, the
 * monthly Pro credits, and what each Stripe webhook event changes. No state of its own, no clock,
 * no network: lib/billing/server.ts runs these inside the table's write queue (mutate), and
 * scripts/test-billing.mts runs them on their own.
 *
 *   Free   25 starting credits, 1 per fact (25 a day), 1 saved view with the weekly email, medians
 *          only in the rate benchmarks, Slack gets the weekly roles post only, 20 Claude requests a day.
 *   Pro    $59 a month or $590 a year: unlimited saved views, every alert in Slack, the Claude
 *          connector without the daily cap, the benchmarks' ranges by client size, the radar's signals
 *          in Slack as they happen (everyone gets every signal each morning), and 100 credits each paid month.
 *   Top-up $19 for 50 credits, once, on any plan.
 *   Trial  21 days of Pro, no card, from the end of onboarding. Extended once by 7 days when, in its
 *          last 4 days, the member opens a conversation, unlocks a warm path or sends an invite.
 *          It ends quietly into Free. Pro can be bought at any point in it: with more than 48 hours
 *          left, the subscription starts in Stripe's trialing status with trial_end at the trial's
 *          end (PlanRecord.proStartsAt), so the member keeps the days left and the first charge, with
 *          its 100 credits, lands when the trial ends. With less left it is charged at once.
 */
import { planOf, pausedAt, type PlanRecord } from "../plan";

export const PRICES = { month: 59, year: 590, topup: 19 } as const;
export const TOPUP_CREDITS = 50;
export const PRO_CREDITS = 100;
export const TRIAL_DAYS = 21;
export const EXTEND_DAYS = 7;
/** The trial is extended when value happens in its last this-many days. */
export const EXTEND_WINDOW_DAYS = 4;
/** The trial-ending moments: 3 days before, and the last day. */
export const ENDING_DAYS = 3;
/** Free keeps one saved view (with the weekly email). */
export const FREE_SAVED_VIEWS = 1;
/** Free gets this many Claude connector requests a day (Pro: the normal limits, 2,000 a day). */
export const FREE_MCP_PER_DAY = 20;
/** A pause is one month. */
export const PAUSE_MONTHS = 1;
/** Subscribing during the trial keeps its days when more than this is left (Stripe wants trial_end at least 48 hours out). */
export const KEEP_TRIAL_MIN_MS = 48 * 3_600_000;
/** Subscribed during the trial: Pro carries on this long past the trial's end while its first charge goes through. */
export const FIRST_CHARGE_GRACE_MS = 86_400_000;
/** Stripe event ids kept for idempotency (newest last). */
export const EVENTS_KEEP = 5000;

const DAY = 86_400_000;
const ms = (iso?: string | null) => (iso ? Date.parse(iso) : NaN);
const isoOf = (n: number) => new Date(n).toISOString();

/** Billing's part of the state (State.billing). */
export interface BillingState {
  members: Record<string, PlanRecord>;
  /** Stripe event ids already handled, newest last. */
  events: string[];
  /** Money in, for Pilot metrics: one row per paid invoice or top-up. Cents only, never card data. */
  payments: { memberId: string; at: string; cents: number; kind: "month" | "year" | "topup"; ref: string }[];
  /** Subscriptions that ended (Stripe deleted them), for churn. */
  ended: { memberId: string; at: string }[];
}
export const emptyBilling = (): BillingState => ({ members: {}, events: [], payments: [], ended: [] });

/** `iso` plus `n` calendar months (the day clamped to the month's end). */
export function addMonths(iso: string, n: number): string {
  const d = new Date(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}

/** Whole calendar months from `from` to `to` (0 inside the first month). */
export function monthsBetween(fromIso: string, toMs: number): number {
  let n = 0;
  while (n < 1200 && ms(addMonths(fromIso, n + 1)) <= toMs) n++;
  return n;
}

/* ---------- the trial ---------- */

/**
 * The trial for a member who just finished onboarding (or who had, when billing was switched on).
 * Null when there is nothing to start: a trial already ran, or they have paid.
 */
export function startTrial(rec: PlanRecord | undefined, nowMs: number): PlanRecord | null {
  if (rec?.trialStartedAt || rec?.proUntil || rec?.paidSince) return null;
  return { ...(rec ?? {}), trialStartedAt: isoOf(nowMs), trialEndsAt: isoOf(nowMs + TRIAL_DAYS * DAY) };
}

/**
 * Value happened (a conversation opened, a warm path unlocked, an invite sent). In the trial's
 * last 4 days, the first time, it runs 7 days longer. Changes `rec` in place; true when it did.
 */
export function extendTrial(rec: PlanRecord | undefined, nowMs: number): boolean {
  if (!rec || rec.trialExtended || planOf(rec, nowMs) !== "trial") return false;
  const end = ms(rec.trialEndsAt);
  if (end - nowMs > EXTEND_WINDOW_DAYS * DAY) return false;
  rec.trialEndsAt = isoOf(end + EXTEND_DAYS * DAY);
  rec.trialExtended = true;
  return true;
}

/** In the trial's last 3 days: the trial-ending moment (banner, plans with prices). */
export const trialEnding = (rec: PlanRecord | undefined, nowMs: number) =>
  planOf(rec, nowMs) === "trial" && ms(rec!.trialEndsAt) - nowMs <= ENDING_DAYS * DAY;

/**
 * Subscribing now, during the trial: the trial's end as Stripe's trial_end (unix seconds), so the
 * first charge lands then. Null when it is charged at once: not on the trial, or 48 hours or less left.
 */
export function keepTrialEnd(rec: PlanRecord | undefined, nowMs: number): number | null {
  if (planOf(rec, nowMs) !== "trial") return null;
  const end = ms(rec!.trialEndsAt);
  return end - nowMs > KEEP_TRIAL_MIN_MS ? Math.floor(end / 1000) : null;
}

/** Subscribed during the trial, and paid Pro hasn't started yet: nothing charged, the first charge still to come. */
export const proStartsLater = (rec: PlanRecord | undefined, nowMs: number) => !!rec?.proStartsAt && ms(rec.proStartsAt) > nowMs && !rec.invoiceId;

/** A trial ran and is over, without a paid plan now. */
export const trialOver = (rec: PlanRecord | undefined, nowMs: number) =>
  !!rec?.trialEndsAt && ms(rec.trialEndsAt) <= nowMs && planOf(rec, nowMs) === "free";

/* ---------- pause and cancel ---------- */

/**
 * Pause Pro for a month: Pro to the end of the period already paid for, then Free for a month with
 * no charge, then Pro again. Returns the dates (Stripe's pause_collection resumes_at is the end),
 * or why it can't.
 */
export function pauseDates(rec: PlanRecord | undefined, nowMs: number): { from: string; until: string } | { why: string } {
  if (!rec?.subscriptionId) return { why: "There's no paid plan to pause." };
  if (rec.cancelAt) return { why: "Your plan is set to end. Keep Pro first, then pause it." };
  if (proStartsLater(rec, nowMs)) return { why: "Nothing is charged until your trial ends. Pause once Pro has started." };
  if (Number.isFinite(ms(rec.pausedUntil)) && ms(rec.pausedUntil) > nowMs) return { why: "Pro is paused already." };
  const end = ms(rec.proUntil);
  const from = Number.isFinite(end) && end > nowMs ? end : nowMs;
  return { from: isoOf(from), until: addMonths(isoOf(from), PAUSE_MONTHS) };
}

/* ---------- the monthly Pro credits ---------- */

/**
 * The ledger ref of the Pro credits due now, or null. One grant per paid month: a monthly plan's
 * invoice is its month; a yearly invoice has twelve, one for each month since it was paid. Paused
 * months and the trial get none. The ledger keeps the ref, so it is paid once.
 */
export function dueGrantRef(rec: PlanRecord | undefined, nowMs: number): string | null {
  if (!rec?.invoiceId || !rec.periodStart || planOf(rec, nowMs) !== "pro") return null;
  const k = rec.interval === "year" ? Math.min(11, monthsBetween(rec.periodStart, nowMs)) : 0;
  return `plan.${rec.invoiceId}.${k}`;
}

/* ---------- Stripe webhook events ---------- */

/** The parts of a Stripe event the rules read (Stripe sends much more). */
export interface StripeEvent {
  id: string;
  type: string;
  created?: number;
  data: { object: Record<string, unknown> };
}

export interface EventCtx {
  nowMs: number;
  /** The member an event is about: from our ref (metadata or client_reference_id), the customer or the subscription. */
  memberOf: (o: { ref?: string | null; customer?: string | null; subscription?: string | null }) => string | null;
}

export interface EventOutcome {
  /** False: an event already handled, one we don't use, or one about nobody we know. */
  handled: boolean;
  why?: "duplicate" | "ignored" | "unknown member" | "unpaid";
  memberId?: string;
  /** Credits to put on the ledger (each ref at most once). */
  grants: { memberId: string; delta: number; reason: "plan" | "topup"; ref: string }[];
  /** A renewal: send the value receipt for the period that just ended. */
  receipt?: { memberId: string; from: string; to: string };
}

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : v && typeof v === "object" && typeof (v as { id?: unknown }).id === "string" ? (v as { id: string }).id : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const unix = (n: number | null) => (n === null ? null : isoOf(n * 1000));

/** An invoice's subscription, wherever this API version puts it. */
const invoiceSub = (inv: Record<string, unknown>) => str(inv.subscription) ?? str(obj(obj(inv.parent).subscription_details).subscription);
const invoiceRef = (inv: Record<string, unknown>) =>
  str(obj(obj(inv.subscription_details).metadata).ref) ?? str(obj(obj(obj(inv.parent).subscription_details).metadata).ref) ?? str(obj(inv.metadata).ref);
/** The period an invoice paid for: its subscription line's, else the invoice's own. */
function invoicePeriod(inv: Record<string, unknown>): { start: string | null; end: string | null; interval: "month" | "year" | null } {
  const lines = (obj(inv.lines).data as unknown[] | undefined) ?? [];
  const line = obj(lines.find((l) => obj(obj(l).period).end) ?? lines[0]);
  const p = obj(line.period);
  const recurring = obj(obj(line.price).recurring);
  const priceInterval = recurring.interval ?? obj(line.plan).interval;
  return {
    start: unix(num(p.start) ?? num(inv.period_start)),
    end: unix(num(p.end) ?? num(inv.period_end)),
    interval: priceInterval === "year" ? "year" : priceInterval === "month" ? "month" : null,
  };
}
/** The trial's end we gave Stripe (metadata trial_end, unix seconds), on a session, a subscription or an invoice. */
function metaTrialEnd(...metas: unknown[]): number | null {
  for (const m of metas) {
    const v = obj(m).trial_end;
    const n = typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}
const invoiceMetas = (inv: Record<string, unknown>) => [obj(inv.subscription_details).metadata, obj(obj(inv.parent).subscription_details).metadata, inv.metadata];
/**
 * Subscribed during the trial (Stripe's trialing status): Pro to the trial's end, plus a day's grace
 * while the first charge goes through, so nothing drops in between. Set to end: to the trial's end only.
 */
function holdTrial(rec: PlanRecord, endS: number, ending: boolean) {
  const end = endS * 1000;
  rec.proStartsAt = isoOf(end);
  rec.proUntil = ending ? isoOf(end) : later(rec.proUntil, isoOf(end + FIRST_CHARGE_GRACE_MS));
}
/** A subscription's period end, wherever this API version puts it. */
const subPeriodEnd = (sub: Record<string, unknown>) => num(sub.current_period_end) ?? num(obj(((obj(sub.items).data as unknown[]) ?? [])[0]).current_period_end);
const subInterval = (sub: Record<string, unknown>): "month" | "year" | null => {
  const item = obj(((obj(sub.items).data as unknown[]) ?? [])[0]);
  const i = obj(obj(item.price).recurring).interval ?? obj(item.plan).interval;
  return i === "year" ? "year" : i === "month" ? "month" : null;
};

/** Money in, once per invoice or checkout (Stripe may send the same one under two events). */
function pay(b: BillingState, row: BillingState["payments"][number]) {
  if (!b.payments.some((x) => x.ref === row.ref && x.kind === row.kind)) b.payments.push(row);
}

const later = (a: string | undefined, b: string | null) => (b && (!a || ms(b) > ms(a)) ? b : a);

/**
 * Apply one Stripe event to billing's state. Idempotent on the event id (an event Stripe sends
 * twice changes nothing the second time), and every grant carries a ref the ledger keeps once.
 */
export function applyEvent(b: BillingState, ev: StripeEvent, ctx: EventCtx): EventOutcome {
  const none = (why: EventOutcome["why"]): EventOutcome => ({ handled: false, why, grants: [] });
  if (!ev?.id || typeof ev.type !== "string") return none("ignored");
  if (b.events.includes(ev.id)) return none("duplicate");
  const o = obj(ev.data?.object);
  const now = isoOf(ctx.nowMs);
  const done = (out: EventOutcome) => {
    b.events.push(ev.id);
    if (b.events.length > EVENTS_KEEP) b.events.splice(0, b.events.length - EVENTS_KEEP);
    return out;
  };
  const recOf = (id: string) => (b.members[id] ??= {});

  switch (ev.type) {
    case "checkout.session.completed": {
      const meta = obj(o.metadata);
      const id = ctx.memberOf({ ref: str(o.client_reference_id) ?? str(meta.ref), customer: str(o.customer), subscription: str(o.subscription) });
      if (!id) return done(none("unknown member"));
      const rec = recOf(id);
      if (str(o.customer)) rec.customerId = str(o.customer)!;
      if (o.mode === "subscription") {
        if (str(o.subscription)) rec.subscriptionId = str(o.subscription)!;
        const interval = meta.interval === "year" ? "year" : "month";
        rec.interval = interval;
        const settled = o.payment_status === "paid" || o.payment_status === "no_payment_required";
        const trialEnd = metaTrialEnd(meta);
        if (settled && trialEnd && trialEnd * 1000 > ctx.nowMs && !rec.invoiceId) {
          // Bought during the trial: trialing at Stripe, nothing charged yet. Pro now and through the
          // trial's end; the first paid invoice then moves Pro to its period's end.
          holdTrial(rec, trialEnd, false);
          delete rec.cancelAt;
        } else if (settled) {
          // Pro at once, until the first invoice says exactly to when.
          rec.proUntil = later(rec.proUntil, addMonths(now, interval === "year" ? 12 : 1));
          rec.paidSince ??= now;
          delete rec.cancelAt;
        }
        return done({ handled: true, memberId: id, grants: [] });
      }
      if (o.mode === "payment" && meta.kind === "topup") {
        if (o.payment_status !== "paid") return done(none("unpaid"));
        const cents = num(o.amount_total) ?? 0;
        pay(b, { memberId: id, at: now, cents, kind: "topup", ref: str(o.id) ?? ev.id });
        return done({ handled: true, memberId: id, grants: [{ memberId: id, delta: TOPUP_CREDITS, reason: "topup", ref: `topup.${str(o.id) ?? ev.id}` }] });
      }
      return done(none("ignored"));
    }
    case "invoice.paid": {
      const sub = invoiceSub(o);
      const id = ctx.memberOf({ ref: invoiceRef(o), customer: str(o.customer), subscription: sub });
      if (!id) return done(none("unknown member"));
      if (!sub) return done(none("ignored"));
      const rec = recOf(id);
      const period = invoicePeriod(o);
      const prevStart = rec.periodStart;
      const prevInvoice = rec.invoiceId;
      rec.subscriptionId = sub;
      if (str(o.customer)) rec.customerId = str(o.customer)!;
      if (period.interval) rec.interval = period.interval;
      const cents = num(o.amount_paid) ?? 0;
      // The $0 invoice Stripe makes when a subscription starts in its trial: it pays for nothing.
      // No credits, no money in, not the first paid month. Pro holds to the trial's end.
      const trialEnd = metaTrialEnd(...invoiceMetas(o)) ?? (rec.proStartsAt ? Math.floor(ms(rec.proStartsAt) / 1000) : null);
      if (cents === 0 && !prevInvoice && trialEnd && (!period.end || ms(period.end) <= trialEnd * 1000 + 60_000)) {
        if (trialEnd * 1000 > ctx.nowMs) holdTrial(rec, trialEnd, !!rec.cancelAt);
        return done({ handled: true, memberId: id, grants: [] });
      }
      // Paid Pro has started: the trial's wait is over.
      delete rec.proStartsAt;
      rec.proUntil = later(rec.proUntil, period.end ?? addMonths(now, rec.interval === "year" ? 12 : 1));
      rec.paidSince ??= now;
      rec.invoiceId = str(o.id) ?? ev.id;
      rec.periodStart = period.start ?? now;
      if (cents > 0 || !rec.cents) rec.cents = cents || rec.cents;
      // A pause that has run its course is over once Pro is paid again.
      if (rec.pausedUntil && ms(rec.pausedUntil) <= ctx.nowMs) delete rec.pausedUntil, delete rec.pausedFrom;
      pay(b, { memberId: id, at: now, cents, kind: rec.interval === "year" ? "year" : "month", ref: rec.invoiceId });
      const ref = dueGrantRef(rec, ctx.nowMs);
      // A renewal sends the receipt for the period before. The first charge after a trial (also a
      // "subscription_cycle" at Stripe) follows no paid period, so it sends none.
      const renewal = o.billing_reason === "subscription_cycle" && !!prevInvoice;
      return done({
        handled: true,
        memberId: id,
        grants: ref ? [{ memberId: id, delta: PRO_CREDITS, reason: "plan", ref }] : [],
        ...(renewal ? { receipt: { memberId: id, from: prevStart ?? rec.paidSince!, to: rec.periodStart } } : {}),
      });
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const id = ctx.memberOf({ ref: str(obj(o.metadata).ref), customer: str(o.customer), subscription: str(o.id) });
      if (!id) return done(none("unknown member"));
      const rec = recOf(id);
      if (str(o.id)) rec.subscriptionId = str(o.id)!;
      if (str(o.customer)) rec.customerId = str(o.customer)!;
      const interval = subInterval(o);
      if (interval) rec.interval = interval;
      const end = unix(subPeriodEnd(o));
      if (o.cancel_at_period_end === true || num(o.cancel_at)) rec.cancelAt = unix(num(o.cancel_at)) ?? end ?? rec.proUntil ?? now;
      else delete rec.cancelAt;
      // Trialing (bought during the trial): Pro through the trial's end, and to the end only once it
      // is set to end. Nothing is charged before then, so nothing is paid for past it.
      const trialEnd = o.status === "trialing" ? num(o.trial_end) ?? metaTrialEnd(o.metadata) : null;
      if (trialEnd && trialEnd * 1000 > ctx.nowMs && !rec.invoiceId) {
        holdTrial(rec, trialEnd, !!rec.cancelAt);
        if (rec.cancelAt && ms(rec.cancelAt) > trialEnd * 1000) rec.cancelAt = isoOf(trialEnd * 1000);
      } else if (o.status && o.status !== "trialing" && rec.proStartsAt && ms(rec.proStartsAt) <= ctx.nowMs) delete rec.proStartsAt;
      const pause = o.pause_collection ? obj(o.pause_collection) : null;
      if (pause && num(pause.resumes_at)) {
        rec.pausedUntil = unix(num(pause.resumes_at))!;
        rec.pausedFrom ??= rec.proUntil && ms(rec.proUntil) > ctx.nowMs ? rec.proUntil : now;
      } else if (!pause && rec.pausedUntil) {
        delete rec.pausedUntil;
        delete rec.pausedFrom;
      }
      return done({ handled: true, memberId: id, grants: [] });
    }
    case "customer.subscription.deleted": {
      const id = ctx.memberOf({ ref: str(obj(o.metadata).ref), customer: str(o.customer), subscription: str(o.id) });
      if (!id) return done(none("unknown member"));
      const rec = recOf(id);
      if (rec.proStartsAt && !rec.invoiceId && !rec.paidSince) {
        // Ended before its first charge (bought during the trial, cancelled inside it): nothing was
        // paid for, so nothing runs on. The member's own trial carries on to its end, then Free. Not churn.
        if (!rec.subscriptionId || rec.subscriptionId === str(o.id)) delete rec.subscriptionId;
        delete rec.proStartsAt;
        delete rec.proUntil;
        delete rec.cancelAt;
        return done({ handled: true, memberId: id, grants: [] });
      }
      // Pro runs to the end of what was paid for (proUntil), then Free. No new charge comes.
      if (!rec.subscriptionId || rec.subscriptionId === str(o.id)) delete rec.subscriptionId;
      rec.cancelAt ??= rec.proUntil ?? now;
      delete rec.pausedUntil;
      delete rec.pausedFrom;
      b.ended.push({ memberId: id, at: now });
      return done({ handled: true, memberId: id, grants: [] });
    }
    default:
      return done(none("ignored"));
  }
}

/* ---------- what the app shows ---------- */

/** The member is paused now (Free, no charge), or a pause is booked. */
export const pauseState = (rec: PlanRecord | undefined, nowMs: number): "now" | "booked" | null =>
  pausedAt(rec, nowMs) ? "now" : rec?.pausedUntil && ms(rec.pausedUntil) > nowMs ? "booked" : null;

/**
 * The line that frames the annual plan by the member's own rate: Pro yearly is under $50 a month.
 * Only with a rate of theirs that makes an hour worth more than that, else null.
 */
export function annualLine(hourly: number | null): string | null {
  if (!hourly || !Number.isFinite(hourly)) return null;
  const perMonth = PRICES.year / 12;
  if (hourly < perMonth) return null;
  return "Less than an hour of your time a month.";
}

/** An hourly figure from a member's rate: hourly as it is, a monthly retainer over about 60 hours a month. */
export function hourlyOf(rate: { kind: "monthly" | "hourly"; amount: number } | null): number | null {
  if (!rate || !(rate.amount > 0)) return null;
  return rate.kind === "hourly" ? rate.amount : rate.amount / 60;
}

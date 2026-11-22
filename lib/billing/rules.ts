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
 *   Close  $79 a month or $790 a year: everything in Pro, plus proposals end to end (Claude
 *          drafting from a call, your own templates and contracts, unlimited send for signature,
 *          the pipeline moving to Won on a signature). The same 100 credits a month. canClose() is
 *          the one gate. Pro and Close move into each other on the same subscription (prorated).
 *   Top-up $19 for 50 credits, once, on any plan.
 *   Trial  the 21-day Close trial (TRIAL_LABEL, the top tier), no card, from the end of onboarding. Extended once by 7 days when, in its
 *          last 4 days, the member opens a conversation, unlocks a warm path or sends an invite.
 *          It ends quietly into Free. Pro can be bought at any point in it: with more than 48 hours
 *          left, the subscription starts in Stripe's trialing status with trial_end at the trial's
 *          end (PlanRecord.proStartsAt), so the member keeps the days left and the first charge, with
 *          its 100 credits, lands when the trial ends. With less left it is charged at once.
 */
import { billingLive, planOf, pausedAt, type PlanRecord } from "../plan";

export const PRICES = { month: 59, year: 590, closeMonth: 79, closeYear: 790, topup: 19, aiPack: 10 } as const;
/** The plans page's lines under Close: what it does, then (smaller) the AI usage pack, once, on Close or the trial. No amount or limit is stated. */
export const CLOSE_AI_LINE = "Merlin drafts your proposals from your calls";
export const AI_PACK_LINE = `Need more AI usage? Add a pack anytime for $${PRICES.aiPack}.`;
/**
 * The paid tiers: Pro ($59, $590 a year) and Close ($79, $790 a year), the same 100 credits
 * a month. Close adds proposals end to end: Claude drafting from a call, your own templates, your
 * own contracts with signature fields, unlimited send for signature, and the pipeline moving to Won
 * when something is signed. The trial is Close. PlanRecord.tier says which a subscription is.
 */
export type Tier = "pro" | "close";
export const TIER_NAME: Record<Tier, string> = { pro: "Pro", close: "Close" };
/** What a tier costs per interval, in dollars. */
export const tierPrice = (tier: Tier, interval: "month" | "year") => (tier === "close" ? (interval === "year" ? PRICES.closeYear : PRICES.closeMonth) : interval === "year" ? PRICES.year : PRICES.month);
/** Pro sold as winning clients: the plans, the Pro welcome, the trial-ended card and the trial emails say it the same way. */
export const PRO_STORY = "Find the company before it posts and get in through the person who held the seat. Close adds the proposal they sign.";
/** The trial summary (what was used, what locks) shows in the trial's last this-many days: Home's banner and the billing page. */
export const SUMMARY_DAYS = 4;
export const TOPUP_CREDITS = 50;
export const PRO_CREDITS = 100;
export const TRIAL_DAYS = 21;
/** The trial is the Close plan: what every screen, email and page calls it ("Your Close trial ends ..."). */
export const TRIAL_NAME = `${TIER_NAME.close} trial`;
/** With its length: "21-day Close trial". */
export const TRIAL_LABEL = `${TRIAL_DAYS}-day ${TRIAL_NAME}`;
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
  payments: { memberId: string; at: string; cents: number; kind: "month" | "year" | "topup" | "aipack"; ref: string }[];
  /** AI usage packs paid for (onAiPackPaid), once per payment ref, newest last. */
  /** `kept`: paid when the member could no longer draft (a Checkout opened in the trial, paid after it ended): the pack waits for Close. */
  aiPacks?: { memberId: string; ref: string; at: string; kept?: true }[];
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

/* ---------- Close ---------- */

/**
 * The one gate for every Close feature (proposals sent for signature, Claude drafting, your own
 * templates and contracts, the pipeline moving on a signature): true on an active trial (the trial
 * is Close), on a paid Close subscription, and for a member who was on paid Pro before Close
 * existed until their next renewal (PlanRecord.closeUntil). False on Free and on plain Pro. While
 * billing isn't live nothing is gated, so it is true.
 */
export function canClose(rec: PlanRecord | undefined, nowMs: number): boolean {
  if (!billingLive()) return true;
  const plan = planOf(rec, nowMs);
  if (plan === "trial") return true;
  if (plan !== "pro") return false;
  if (rec!.tier === "close") return true;
  return !!rec!.closeUntil && nowMs < ms(rec!.closeUntil);
}

/**
 * What a member did with Close features in their trial, counts only (lib/table.ts closeUseOf):
 * proposals and documents they made, Claude drafts, and things they sent for signature.
 */
export interface CloseUse {
  made: number;
  drafted: number;
  sent: number;
}
/**
 * The "active Close user" threshold: the trial's plans sheet, Home's trial card, the trial nudge and
 * the trial-ending emails nudge toward Pro by default, and toward Close once the member has
 * used Close for real. Active is any one thing sent for signature (a proposal or a document), or
 * CLOSE_ACTIVE_MIN or more of the other Close actions together (a proposal or document made, a
 * draft written with Claude). One proposal made and left alone is not enough.
 */
export const CLOSE_ACTIVE_MIN = 2;
export const closeActive = (u: CloseUse): boolean => u.sent > 0 || u.made + u.drafted >= CLOSE_ACTIVE_MIN;
/** The plan the trial nudges toward: Pro, or Close for an active Close user. */
export const keepTier = (u: CloseUse): Tier => (closeActive(u) ? "close" : "pro");
/**
 * The trial's button for the plan it nudges toward: "Keep Close" (the trial is Close, so it carries
 * on), or "Choose Pro" (a plan the member isn't on yet, so nothing reads as if they had it).
 */
export const keepWords = (t: Tier) => (t === "close" ? `Keep ${TIER_NAME.close}` : `Choose ${TIER_NAME.pro}`);
/** The same in a sentence: "unless you keep Close", "unless you choose Pro". */
export const keepVerb = (t: Tier) => (t === "close" ? `keep ${TIER_NAME.close}` : `choose ${TIER_NAME.pro}`);

/**
 * The member's plan by name, the one helper every screen and email uses: "Free", "Pro", "Close",
 * or "Close trial". `name` is PlanView.name (planOf); `tier` the paid tier (Pro unless it says Close).
 */
export function planName(p: { name: "free" | "trial" | "pro"; tier?: string | null } | null | undefined): string {
  if (!p || p.name === "free") return "Free";
  if (p.name === "trial") return TRIAL_NAME;
  return paidName(p.tier);
}
/** The paid tier a subscription is on, paused or not: "Pro" or "Close". */
export const paidName = (tier?: string | null): string => TIER_NAME[tier === "close" ? "close" : "pro"];

/** The tier a member is on now, for the plans and the gates' words: Free, Pro, or Close (the trial is Close). */
export function tierNow(rec: PlanRecord | undefined, nowMs: number): "free" | Tier {
  const plan = planOf(rec, nowMs);
  if (plan === "free") return "free";
  if (plan === "trial") return "close";
  return rec!.tier === "close" ? "close" : "pro";
}

/**
 * Once, when Close arrives: a member already on paid Pro stays on Pro, and keeps Close features
 * until their next renewal (closeUntil, the end of the period they paid for). Returns how many.
 */
export function grandfatherClose(b: BillingState, nowMs: number): number {
  let n = 0;
  for (const rec of Object.values(b.members)) {
    if (rec.tier || !rec.paidSince || !(ms(rec.proUntil) > nowMs)) continue;
    rec.tier = "pro";
    rec.closeUntil = rec.proUntil;
    n++;
  }
  return n;
}

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
  if (rec.cancelAt) return { why: `Your plan is set to end. Keep ${paidName(rec.tier)} first, then pause it.` };
  if (proStartsLater(rec, nowMs)) return { why: `Nothing is charged until your trial ends. Pause once ${paidName(rec.tier)} has started.` };
  if (Number.isFinite(ms(rec.pausedUntil)) && ms(rec.pausedUntil) > nowMs) return { why: `${paidName(rec.tier)} is paused already.` };
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
  /** Which tier a Stripe price id is (lib/billing/stripe.ts tierOfPrice): null for a price we don't know. */
  tierOf?: (priceId: string | null) => Tier | null;
}

export interface EventOutcome {
  /** False: an event already handled, one we don't use, or one about nobody we know. */
  handled: boolean;
  why?: "duplicate" | "ignored" | "unknown member" | "unpaid";
  memberId?: string;
  /** Credits to put on the ledger (each ref at most once). */
  grants: { memberId: string; delta: number; reason: "plan" | "topup"; ref: string }[];
  /** An AI usage pack was paid for: hand it to onAiPackPaid (each ref once). */
  aiPack?: { memberId: string; ref: string };
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
function invoicePeriod(inv: Record<string, unknown>): { start: string | null; end: string | null; interval: "month" | "year" | null; price: string | null } {
  const lines = (obj(inv.lines).data as unknown[] | undefined) ?? [];
  const line = obj(lines.find((l) => obj(obj(l).period).end) ?? lines[0]);
  const p = obj(line.period);
  const recurring = obj(obj(line.price).recurring);
  const priceInterval = recurring.interval ?? obj(line.plan).interval;
  return {
    start: unix(num(p.start) ?? num(inv.period_start)),
    end: unix(num(p.end) ?? num(inv.period_end)),
    interval: priceInterval === "year" ? "year" : priceInterval === "month" ? "month" : null,
    price: str(obj(line.price).id) ?? str(obj(line.plan).id),
  };
}
/** A tier read from metadata we set at checkout ("tier"), on a session or a subscription. */
const metaTier = (m: unknown): Tier | null => (obj(m).tier === "close" ? "close" : obj(m).tier === "pro" ? "pro" : null);
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
/** A subscription's price id (its first item). */
const subPrice = (sub: Record<string, unknown>) => {
  const item = obj(((obj(sub.items).data as unknown[]) ?? [])[0]);
  return str(obj(item.price).id) ?? str(obj(item.plan).id);
};
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
        // Pro or Close, as checkout was asked for (metadata tier).
        rec.tier = metaTier(meta) ?? "pro";
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
      // The AI usage pack: the same pattern as the top-up, handed on (onAiPackPaid) instead of credits.
      if (o.mode === "payment" && meta.kind === "aipack") {
        if (o.payment_status !== "paid") return done(none("unpaid"));
        const ref = `aipack.${str(o.id) ?? ev.id}`;
        pay(b, { memberId: id, at: now, cents: num(o.amount_total) ?? 0, kind: "aipack", ref: str(o.id) ?? ev.id });
        return done({ handled: true, memberId: id, grants: [], aiPack: { memberId: id, ref } });
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
      const paidTier = ctx.tierOf?.(period.price) ?? metaTier(invoiceMetas(o).find((m) => metaTier(m)));
      if (paidTier) rec.tier = paidTier;
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
      // An upgrade to Close, or back to Pro, changes the subscription's price: its tier follows.
      const subTier = ctx.tierOf?.(subPrice(o)) ?? metaTier(o.metadata);
      if (subTier) rec.tier = subTier;
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

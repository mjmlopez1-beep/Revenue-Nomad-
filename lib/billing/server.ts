/**
 * Billing on the server: the member's actions (checkout, top-up, the portal, cancel, keep, pause,
 * resume), the Stripe webhook, and the sweep that sends the trial notices. Every change to the
 * state goes through the table's write queue (mutate), so it lands in order with everything else.
 *
 * Works only while billing is live (lib/plan.ts billingLive: RN_BILLING=1 and Stripe set up).
 * Stripe ids stay on the server; the browser only ever gets a Checkout or Portal address.
 */
import { ActionError, loadSeed, loadState, memberByToken, tableInternals as T, type State } from "../table";
import { billingLive, planOf, upgradeUrl } from "../plan";
import { applyEvent, emptyBilling, ENDING_DAYS, pauseDates, PAUSE_MONTHS, annualLine, hourlyOf, type StripeEvent } from "./rules";
import * as stripe from "./stripe";
import { renewalEmail, trialEndedEmail, trialEndingEmail, type ValueCounts } from "./emails";
import { emailEnabled, sendEmail } from "../email";
import { publicBase } from "../links";
import { addSignIn } from "../signin";
import { functionOf } from "../tableFields";

const DAY = 86_400_000;
/** "November 18", with the year when it isn't this one. */
const dayWords = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", ...(d.getUTCFullYear() === new Date().getUTCFullYear() ? {} : { year: "numeric" }), timeZone: "UTC" });
};
const NOT_LIVE = "Plans aren't open yet.";
const SIGNED_OUT = "You're signed out. Sign in again to manage your plan.";

/** The member behind a billing ref, customer or subscription. */
function memberOf(s: State, all: { id: string }[]) {
  const byRef = new Map(all.map((m) => [T.billingRef(m.id), m.id]));
  return (o: { ref?: string | null; customer?: string | null; subscription?: string | null }): string | null => {
    if (o.ref && byRef.has(o.ref)) return byRef.get(o.ref)!;
    for (const [id, rec] of Object.entries(s.billing?.members ?? {})) {
      if (o.subscription && rec.subscriptionId === o.subscription) return id;
      if (o.customer && rec.customerId === o.customer) return id;
    }
    return null;
  };
}

/* ---------- what a member did, as counts ---------- */

/** What a member got between two times: conversations they opened, intros they sent, unlocks, new roles in their function. */
export function valueCounts(s: State, seedTracks: Map<string, { firstSeen: string; engagementId: string }> | null, fnOfEng: ((engId: string) => string | null) | null, memberId: string, fromIso: string, toIso: string): ValueCounts {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  const inside = (iso?: string | null) => {
    const t = Date.parse(iso ?? "");
    return Number.isFinite(t) && t >= from && t < to;
  };
  const prof = s.profiles[memberId] ?? {};
  const fn = prof.function ?? functionOf(prof.title ?? "") ?? null;
  let roles = 0;
  if (seedTracks && fnOfEng && fn)
    for (const t of seedTracks.values()) if (inside(t.firstSeen) && fnOfEng(t.engagementId) === fn) roles++;
  return {
    conversations: (s.conversations ?? []).filter((c) => c.a === memberId && inside(c.createdAt)).length,
    invites: (s.seatInvites ?? []).filter((x) => x.by === memberId && inside(x.at)).length,
    unlocks: s.ledger.filter((l) => l.memberId === memberId && l.reason === "unlock" && inside(l.at)).length,
    roles,
    function: fn,
  };
}

/** Counts for one member, reading the open roles the scan followed. */
async function countsFor(memberId: string, fromIso: string, toIso: string): Promise<ValueCounts> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const g = T.graph(seed, s);
  const tracks = T.tracksOf(seed, s);
  const fnOfEng = (engId: string) => {
    const e = g.engagements.get(engId);
    return e ? T.fnOf(e, s) : null;
  };
  return valueCounts(s, tracks, fnOfEng, memberId, fromIso, toIso);
}

const baseOf = (origin?: string) => (publicBase() || origin || "").replace(/\/$/, "");

/** A one-time sign-in link (7 days) that opens the plans. Made inside a write. */
function planLink(s: State, memberId: string, base: string, nowMs: number): string {
  const { token } = addSignIn(s, memberId, "message", nowMs);
  return `${base}/?k=${encodeURIComponent(token)}&p=billing&plans=1`;
}

/** The member's own rate, framed for the annual line (or null). */
function rateLineOf(s: State, memberId: string): string | null {
  const b = s.benchRates.filter((x) => x.by === memberId).sort((x, y) => y.at.localeCompare(x.at))[0];
  return annualLine(hourlyOf(b ? { kind: b.kind, amount: b.amount } : null));
}

/* ---------- the member's actions ---------- */

export type BillingOp = "checkout" | "topup" | "portal" | "cancel" | "keep" | "pause" | "resume";

/**
 * One billing action for the signed-in member. Checkout, top-up and portal answer with a Stripe
 * address to open; the rest change the subscription at Stripe first, then here (the webhook that
 * follows agrees).
 */
export async function billingAction(token: string | null, op: BillingOp, body: { interval?: unknown; code?: unknown }, origin?: string): Promise<{ url?: string; message?: string }> {
  if (!billingLive()) throw new ActionError(NOT_LIVE);
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) throw new ActionError(SIGNED_OUT);
  const rec = s.billing?.members[me.id];
  const base = baseOf(origin);
  const nowMs = Date.now();
  const who = { ref: T.billingRef(me.id), email: me.email, ...(rec?.customerId ? { customerId: rec.customerId } : {}) };
  try {
    switch (op) {
      case "checkout": {
        if (planOf(rec, nowMs) === "pro" && rec?.subscriptionId) throw new ActionError("You're on Pro already. Change your plan in Manage billing.");
        return { url: await stripe.checkoutPro(who, body.interval === "year" ? "year" : "month", base, body.code) };
      }
      case "topup":
        if (!stripe.topupReady()) throw new ActionError("Top-ups aren't open yet.");
        return { url: await stripe.checkoutTopup(who, base) };
      case "portal":
        if (!rec?.customerId) throw new ActionError("There's nothing to manage yet: no card is on file.");
        return { url: await stripe.portal(rec.customerId, base) };
      case "cancel":
      case "keep": {
        if (!rec?.subscriptionId) throw new ActionError("There's no paid plan to change.");
        await stripe.setCancel(rec.subscriptionId, op === "cancel");
        await T.mutate((d) => {
          const r = d.billing?.members[me.id];
          if (!r) return;
          if (op === "cancel") r.cancelAt = r.proUntil ?? new Date(nowMs).toISOString();
          else delete r.cancelAt;
        });
        const until = rec.proUntil ? dayWords(rec.proUntil) : "the end of this period";
        return { message: op === "cancel" ? `Cancelled. You keep Pro until ${until}, then you're on Free. Nothing more is charged.` : "Pro carries on. Nothing changes." };
      }
      case "pause": {
        const d0 = pauseDates(rec, nowMs);
        if ("why" in d0) throw new ActionError(d0.why);
        await stripe.setPause(rec!.subscriptionId!, d0.until);
        await T.mutate((d) => {
          const r = d.billing?.members[me.id];
          if (!r) return;
          r.pausedFrom = d0.from;
          r.pausedUntil = d0.until;
        });
        return { message: `Paused for ${PAUSE_MONTHS === 1 ? "a month" : `${PAUSE_MONTHS} months`}. You keep Pro until ${dayWords(d0.from)}, then Free with no charge, and Pro comes back on ${dayWords(d0.until)}.` };
      }
      case "resume": {
        if (!rec?.subscriptionId || !rec.pausedUntil) throw new ActionError("Pro isn't paused.");
        await stripe.setPause(rec.subscriptionId, null);
        await T.mutate((d) => {
          const r = d.billing?.members[me.id];
          if (!r) return;
          delete r.pausedUntil;
          delete r.pausedFrom;
        });
        return { message: "The pause is off. Pro carries on, and the next charge comes on its usual day." };
      }
      default:
        throw new ActionError("That didn't go through. Refresh the page and try again.");
    }
  } catch (e) {
    if (e instanceof stripe.StripeError) throw new ActionError(e.message);
    throw e;
  }
}

/* ---------- the webhook ---------- */

export type WebhookAnswer = { status: 200 | 400; body: { received: boolean; error?: string; why?: string } };

/**
 * One Stripe webhook delivery: the signature first (STRIPE_WEBHOOK_SECRET, 5 minutes' tolerance),
 * then the event, once. A bad or old signature is 400 and changes nothing. Credits go on the
 * ledger by ref, so a repeat never pays twice; a renewal sends the value receipt.
 */
export async function handleWebhook(raw: string, signature: string | null, origin?: string, nowMs = Date.now()): Promise<WebhookAnswer> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "";
  if (!billingLive() || !secret) return { status: 400, body: { received: false, error: "Billing is off." } };
  const check = stripe.verifySignature(raw, signature, secret, Math.floor(nowMs / 1000));
  if (check !== "ok") return { status: 400, body: { received: false, error: `Signature ${check}.` } };
  let ev: StripeEvent;
  try {
    ev = JSON.parse(raw) as StripeEvent;
  } catch {
    return { status: 400, body: { received: false, error: "Not JSON." } };
  }
  const base = baseOf(origin);
  const out = await T.mutate((s, seed) => {
    s.billing ??= emptyBilling();
    const idx = T.memberIndex(seed, s);
    const o = applyEvent(s.billing, ev, { nowMs, memberOf: memberOf(s, idx.all) });
    const at = new Date(nowMs).toISOString();
    for (const gr of o.grants) if (!s.ledger.some((l) => l.reason === gr.reason && l.ref === gr.ref)) s.ledger.push({ ...gr, at });
    let mail: { to: string; first: string; link: string; interval: "month" | "year"; from: string; till: string } | null = null;
    if (o.receipt && emailEnabled() && base) {
      const m = idx.byId.get(o.receipt.memberId);
      if (m?.email) mail = { to: m.email, first: T.firstName(m.name), link: planLink(s, m.id, base, nowMs).replace("&plans=1", ""), interval: s.billing.members[m.id]?.interval ?? "month", from: o.receipt.from, till: o.receipt.to };
    }
    return { o, mail };
  });
  if (out.mail) {
    const m = out.mail;
    void countsFor(out.o.receipt!.memberId, m.from, m.till)
      .then((counts) => {
        const e = renewalEmail({ first: m.first, counts, interval: m.interval, link: m.link });
        return sendEmail(m.to, e.subject, e.text, e.html);
      })
      .catch((e) => console.error("renewal receipt failed", e));
  }
  return { status: 200, body: { received: true, ...(out.o.handled ? {} : { why: out.o.why }) } };
}

/* ---------- the sweep: trial notices, monthly credits ---------- */

let sweeping = false;

/**
 * Send the trial notices that are due (3 days before, the last day, and the value receipt when it
 * ended), and the month's Pro credits on yearly plans. Each notice once per member (PlanRecord.notices).
 * Runs at most once an hour from page loads (billingVisit). Returns how many emails went out.
 */
export async function sweep(nowIso?: string, origin?: string): Promise<{ sent: number; granted: number }> {
  if (!billingLive() || sweeping) return { sent: 0, granted: 0 };
  sweeping = true;
  try {
    const nowMs = nowIso ? Date.parse(nowIso) : Date.now();
    const base = baseOf(origin);
    const mailOn = emailEnabled() && !!base;
    type Due = { memberId: string; kind: "trial3" | "trialLast" | "trialEnd"; to: string; first: string; link: string; notLooking: boolean; rateLine: string | null; from: string; till: string; days: number };
    const { due, granted } = await T.mutate((s, seed) => {
      const idx = T.memberIndex(seed, s);
      const list: Due[] = [];
      let n = 0;
      for (const [id, rec] of Object.entries(s.billing?.members ?? {})) {
        const m = idx.byId.get(id);
        if (!m) continue;
        // Yearly Pro: the month's credits, once.
        n += T.grantPlanCredits(s, id, nowMs);
        if (!mailOn || !m.email || !rec.trialEndsAt) continue;
        const notices = (rec.notices ??= {});
        const end = Date.parse(rec.trialEndsAt);
        const left = end - nowMs;
        const plan = planOf(rec, nowMs);
        const notLooking = s.profiles[id]?.looking === false;
        let kind: Due["kind"] | null = null;
        if (plan === "trial" && left <= DAY && !notices.trialLast) kind = "trialLast";
        // Not looking: one soft note on the last day, never a countdown.
        else if (plan === "trial" && left <= ENDING_DAYS * DAY && left > DAY && !notices.trial3 && !notLooking) kind = "trial3";
        else if (plan === "free" && left <= 0 && -left < 7 * DAY && !notices.trialEnd && !rec.paidSince) kind = "trialEnd";
        if (!kind) continue;
        notices[kind] = new Date(nowMs).toISOString();
        // Their last-day note also stands for the 3-day one: no second countdown after it.
        if (kind === "trialLast") notices.trial3 ??= notices.trialLast;
        list.push({
          memberId: id,
          kind,
          to: m.email,
          first: T.firstName(m.name),
          link: planLink(s, id, base, nowMs),
          notLooking,
          rateLine: rateLineOf(s, id),
          from: rec.trialStartedAt ?? rec.trialEndsAt,
          till: rec.trialEndsAt,
          days: Math.max(1, Math.ceil(left / DAY)),
        });
      }
      return { due: list, granted: n };
    });
    let sent = 0;
    for (const d of due) {
      try {
        const e =
          d.kind === "trialEnd"
            ? trialEndedEmail({ first: d.first, counts: await countsFor(d.memberId, d.from, d.till), notLooking: d.notLooking, rateLine: d.rateLine, link: d.link })
            : trialEndingEmail({ first: d.first, days: d.kind === "trialLast" ? 1 : d.days, notLooking: d.notLooking, rateLine: d.rateLine, link: d.link });
        if (await sendEmail(d.to, e.subject, e.text, e.html)) sent++;
      } catch (e) {
        console.error("billing notice failed for one member", e);
      }
    }
    return { sent, granted };
  } finally {
    sweeping = false;
  }
}

/** Where an upgrade link goes, from the server's public address. For the radar's teaser. */
export const upgradeLink = (from: string, origin?: string) => upgradeUrl(baseOf(origin), from);

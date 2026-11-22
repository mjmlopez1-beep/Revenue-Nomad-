/**
 * Stripe, through its REST API with fetch: Checkout for the subscription and the top-up, the
 * Customer Portal for the card, invoices and cancelling, subscription updates for cancel and pause,
 * and the webhook signature check. No SDK.
 *
 *   STRIPE_SECRET_KEY       the secret key (sk_live_... or sk_test_...). Never logged, never sent to the browser.
 *   STRIPE_WEBHOOK_SECRET   the webhook endpoint's signing secret (whsec_...)
 *   STRIPE_PRICE_MONTH      the price id of Pro monthly ($59)
 *   STRIPE_PRICE_YEAR       the price id of Pro yearly ($590)
 *   STRIPE_PRICE_CLOSE_MONTH  the price id of Close monthly ($79)
 *   STRIPE_PRICE_CLOSE_YEAR   the price id of Close yearly ($790). Without both there is no Close checkout.
 *   STRIPE_PRICE_TOPUP      the price id of the one-time top-up ($19 for 50 credits). Without it there is no top-up.
 *   STRIPE_PRICE_AIPACK     the price id of the one-time AI usage pack ($10). Without it there is none.
 *   RN_SURVEY_CODE          the code survey respondents type (e.g. RN-SURVEY10). Members can type any promotion code at checkout.
 *   STRIPE_PROMO_SURVEY     optional: that code's promotion code id (promo_...), so a member who arrives with
 *                           ?code=RN-SURVEY10 gets it applied without typing it.
 *   STRIPE_API_URL          tests only: where requests go instead of https://api.stripe.com
 */
import { createHmac, timingSafeEqual } from "crypto";

export class StripeError extends Error {}

const apiBase = () => (process.env.STRIPE_API_URL?.trim() || "https://api.stripe.com").replace(/\/$/, "");
const key = () => process.env.STRIPE_SECRET_KEY?.trim() ?? "";

/** Stripe's form encoding: nested keys as a[b][c]. */
export function formBody(params: Record<string, string | number | boolean | null | undefined>): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) out.append(k, String(v));
  return out.toString();
}

/** One API call. Errors carry Stripe's message (never the key), and nothing about cards is ever sent or logged here. */
async function call(method: "GET" | "POST", path: string, params: Record<string, string | number | boolean | null | undefined> = {}): Promise<Record<string, unknown>> {
  if (!key()) throw new StripeError("Payments aren't set up yet.");
  const body = method === "POST" ? formBody(params) : undefined;
  const qs = method === "GET" && Object.keys(params).length ? `?${formBody(params)}` : "";
  let r: Response;
  try {
    r = await fetch(`${apiBase()}/v1/${path}${qs}`, {
      method,
      headers: { Authorization: `Bearer ${key()}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) },
      body,
    });
  } catch {
    throw new StripeError("We couldn't reach the payment service. Try again in a moment.");
  }
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const msg = (data.error as { message?: string } | undefined)?.message;
    console.error(`stripe ${method} ${path.split("/")[0]} failed: ${r.status}${msg ? ` ${String(msg).slice(0, 200)}` : ""}`);
    throw new StripeError("The payment service said no. Try again in a moment.");
  }
  return data;
}

type PriceKey = "month" | "year" | "closeMonth" | "closeYear" | "topup" | "aipack";
const PRICE_ENV: Record<PriceKey, string> = { month: "STRIPE_PRICE_MONTH", year: "STRIPE_PRICE_YEAR", closeMonth: "STRIPE_PRICE_CLOSE_MONTH", closeYear: "STRIPE_PRICE_CLOSE_YEAR", topup: "STRIPE_PRICE_TOPUP", aipack: "STRIPE_PRICE_AIPACK" };
const price = (k: PriceKey) => process.env[PRICE_ENV[k]]?.trim() ?? "";
export const topupReady = () => !!price("topup");
export const aiPackReady = () => !!price("aipack");
/** Close can be bought: both its prices are set up. */
export const closeReady = () => !!price("closeMonth") && !!price("closeYear");
/** The price id for a tier and interval. */
export const priceFor = (tier: "pro" | "close", interval: "month" | "year") => price(tier === "close" ? (interval === "year" ? "closeYear" : "closeMonth") : interval);
/** Which tier a Stripe price id is, for the webhook (lib/billing/rules.ts EventCtx.tierOf). Null for one we don't know. */
export function tierOfPrice(id: string | null): "pro" | "close" | null {
  if (!id) return null;
  if (id === price("closeMonth") || id === price("closeYear")) return "close";
  if (id === price("month") || id === price("year")) return "pro";
  return null;
}

/** The survey code, when this is it (case and spaces don't matter). */
export function surveyCode(raw: unknown): boolean {
  const want = process.env.RN_SURVEY_CODE?.trim().toUpperCase();
  return !!want && String(raw ?? "").trim().toUpperCase() === want;
}

interface Who {
  /** Our opaque reference for the member (never their id or name). */
  ref: string;
  email: string;
  customerId?: string;
}

/**
 * Checkout for Pro, monthly or yearly. Promotion codes can be typed; the survey code is applied when
 * the member brought it. `trialEnd` (unix seconds, lib/billing/rules keepTrialEnd): bought during the
 * trial, the subscription starts trialing to then, so the days left are kept and the first charge
 * lands when the trial ends. It goes in the metadata too, so the webhook reads it on every event.
 */
export async function checkoutPro(who: Who, interval: "month" | "year", base: string, code?: unknown, trialEnd?: number | null, tier: "pro" | "close" = "pro"): Promise<string> {
  const promo = surveyCode(code) ? process.env.STRIPE_PROMO_SURVEY?.trim() : "";
  const trial = trialEnd && Number.isFinite(trialEnd) ? Math.floor(trialEnd) : null;
  const s = await call("POST", "checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": priceFor(tier, interval),
    "line_items[0][quantity]": 1,
    // Back on Home, where the one-time welcome is (app/post/TradingPost.tsx reads paid=1, and plan= for the thanks to name the plan bought).
    success_url: `${base}/?paid=1&plan=${tier}`,
    cancel_url: `${base}/?p=billing`,
    client_reference_id: who.ref,
    "metadata[ref]": who.ref,
    "metadata[interval]": interval,
    "metadata[tier]": tier,
    "subscription_data[metadata][ref]": who.ref,
    "subscription_data[metadata][tier]": tier,
    ...(trial ? { "subscription_data[trial_end]": trial, "subscription_data[metadata][trial_end]": trial, "metadata[trial_end]": trial } : {}),
    ...(who.customerId ? { customer: who.customerId } : { customer_email: who.email }),
    // Stripe takes one or the other: a code applied for them, or a box to type one.
    ...(promo ? { "discounts[0][promotion_code]": promo } : { allow_promotion_codes: true }),
  });
  if (typeof s.url !== "string") throw new StripeError("The payment page didn't open. Try again in a moment.");
  return s.url;
}

/** Checkout for the one-time top-up: 50 credits. */
export async function checkoutTopup(who: Who, base: string): Promise<string> {
  const s = await call("POST", "checkout/sessions", {
    mode: "payment",
    "line_items[0][price]": price("topup"),
    "line_items[0][quantity]": 1,
    success_url: `${base}/?p=billing&topup=1`,
    cancel_url: `${base}/?p=billing`,
    client_reference_id: who.ref,
    "metadata[ref]": who.ref,
    "metadata[kind]": "topup",
    ...(who.customerId ? { customer: who.customerId } : { customer_email: who.email, customer_creation: "always" }),
    allow_promotion_codes: true,
  });
  if (typeof s.url !== "string") throw new StripeError("The payment page didn't open. Try again in a moment.");
  return s.url;
}

/** Checkout for the one-time AI usage pack. The same pattern as the top-up. */
export async function checkoutAiPack(who: Who, base: string): Promise<string> {
  const s = await call("POST", "checkout/sessions", {
    mode: "payment",
    "line_items[0][price]": price("aipack"),
    "line_items[0][quantity]": 1,
    success_url: `${base}/?p=billing&aipack=1`,
    cancel_url: `${base}/?p=billing`,
    client_reference_id: who.ref,
    "metadata[ref]": who.ref,
    "metadata[kind]": "aipack",
    ...(who.customerId ? { customer: who.customerId } : { customer_email: who.email, customer_creation: "always" }),
    allow_promotion_codes: true,
  });
  if (typeof s.url !== "string") throw new StripeError("The payment page didn't open. Try again in a moment.");
  return s.url;
}

/** The Customer Portal: card, invoices, cancel. */
export async function portal(customerId: string, base: string): Promise<string> {
  const s = await call("POST", "billing_portal/sessions", { customer: customerId, return_url: `${base}/?p=billing` });
  if (typeof s.url !== "string") throw new StripeError("The billing page didn't open. Try again in a moment.");
  return s.url;
}

/**
 * Move a subscription between Pro and Close at the same interval: its one item takes the
 * other price, with Stripe's proration (an upgrade invoices the difference now, a downgrade credits
 * it to the next invoice). The tier goes in the metadata too, so the webhook reads it.
 */
export async function changeTier(subscriptionId: string, tier: "pro" | "close", interval: "month" | "year"): Promise<void> {
  const sub = await call("GET", `subscriptions/${encodeURIComponent(subscriptionId)}`);
  const item = ((sub.items as { data?: { id?: string }[] } | undefined)?.data ?? [])[0]?.id;
  if (!item) throw new StripeError("We couldn't find your plan at the payment service. Try again in a moment.");
  await call("POST", `subscriptions/${encodeURIComponent(subscriptionId)}`, {
    "items[0][id]": item,
    "items[0][price]": priceFor(tier, interval),
    proration_behavior: tier === "close" ? "always_invoice" : "create_prorations",
    "metadata[tier]": tier,
  });
}

/** Cancel at the end of the paid period, or take that back. */
export const setCancel = (subscriptionId: string, on: boolean) => call("POST", `subscriptions/${encodeURIComponent(subscriptionId)}`, { cancel_at_period_end: on });

/** Pause: no invoices until `untilIso`, then they resume. `null` resumes now. */
export const setPause = (subscriptionId: string, untilIso: string | null) =>
  call(
    "POST",
    `subscriptions/${encodeURIComponent(subscriptionId)}`,
    untilIso ? { "pause_collection[behavior]": "void", "pause_collection[resumes_at]": Math.floor(Date.parse(untilIso) / 1000) } : { pause_collection: "" },
  );

/* ---------- the webhook signature ---------- */

/** How old a signed webhook may be (Stripe's default tolerance). */
export const SIGNATURE_TOLERANCE_S = 300;

/**
 * Check Stripe-Signature ("t=<unix>,v1=<hex>[,v1=...]"): an HMAC-SHA256 of "<t>.<raw body>" with
 * the endpoint secret, made within the tolerance. Compared in constant time.
 */
export function verifySignature(payload: string, header: string | null | undefined, secret: string, nowS = Math.floor(Date.now() / 1000), tolerance = SIGNATURE_TOLERANCE_S): "ok" | "missing" | "bad" | "old" {
  if (!header || !secret) return "missing";
  let ts = NaN;
  const sigs: string[] = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=", 2).map((x) => x?.trim() ?? "");
    if (k === "t") ts = Number(v);
    else if (k === "v1" && /^[0-9a-f]{64}$/i.test(v)) sigs.push(v.toLowerCase());
  }
  if (!Number.isFinite(ts) || !sigs.length) return "bad";
  const want = Buffer.from(createHmac("sha256", secret).update(`${ts}.${payload}`, "utf8").digest("hex"));
  const match = sigs.some((s) => {
    const got = Buffer.from(s);
    return got.length === want.length && timingSafeEqual(got, want);
  });
  if (!match) return "bad";
  if (Math.abs(nowS - ts) > tolerance) return "old";
  return "ok";
}

/** A signature header for `payload`, as Stripe makes it. For tests. */
export const signFor = (payload: string, secret: string, ts = Math.floor(Date.now() / 1000)) => `t=${ts},v1=${createHmac("sha256", secret).update(`${ts}.${payload}`, "utf8").digest("hex")}`;

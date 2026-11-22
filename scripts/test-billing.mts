/**
 * Checks of Merlin's payment model (lib/plan.ts, lib/billing): plans over time, the reverse trial
 * and its one extension, pause and cancel, the Stripe webhook (signature, each event, once), the
 * monthly Pro credits and top-ups, the Free limits on and off, and nothing changing with billing off.
 *
 *   npx tsx scripts/test-billing.mts
 *
 * No private data and no network: a made-up seed and state in a temporary folder, removed at the
 * end. Every person in them is made up. Nothing reaches Stripe or an email service: fetch is
 * replaced, and the keys are made-up test strings.
 *
 *  1. Pure: planOf over time, startTrial, extendTrial, pauseDates, dueGrantRef, the signature
 *     check, each webhook event through applyEvent (and twice), a subscription bought during the
 *     trial (Stripe's trialing status: the $0 invoice, cancel and keep, the first paid invoice,
 *     deleted inside the trial), the annual line.
 *  2. In process with billing off: nothing gated, no plan, no billing state.
 *  3. RN_BILLING=1 without Stripe: still off.
 *  4. Billing live: the trial at the end of onboarding and on the next visit, Free's limits (one
 *     saved view, medians only, Slack and Claude), the extension, the webhook end to end, checkout,
 *     the portal, cancel, keep, pause, resume, the trial notices, Pilot metrics' counts, and
 *     upgrading during the trial end to end (trial_end at checkout, the webhook, the first charge).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 600)}`);
};

const DAY = 86_400_000;
const dir = mkdtempSync(path.join(tmpdir(), "rn-billing-"));
const seed = {
  builtAt: new Date(Date.now() - 30 * DAY).toISOString(),
  members: [
    { id: "mem_al", name: "Al Trialson", email: "al.trialson@example.com", title: "Fractional VP Sales", token: "tok-al-0001" },
    { id: "mem_bo", name: "Bo Beforehand", email: "bo.beforehand@example.com", title: "Fractional CMO", token: "tok-bo-0001" },
    { id: "mem_cy", name: "Cy Freeman", email: "cy.freeman@example.com", title: "Fractional CRO", token: "tok-cy-0001" },
    { id: "mem_di", name: "Di Payer", email: "di.payer@example.com", title: "Fractional CFO", token: "tok-di-0001" },
    { id: "mem_ed", name: "Ed Quietly", email: "ed.quietly@example.com", title: "Fractional COO", token: "tok-ed-0001" },
    { id: "mem_ad", name: "Ada Admin", email: "ada.admin@example.com", title: "Fractional CTO", token: "tok-ad-0001" },
  ],
  companies: [{ id: "c_bill", fields: { name: "Ledgerline Labs", website: "ledgerline.example", industry: "SaaS", employees: "51–200" } }],
  engagements: [
    { id: "e_bill_cfo", companyId: "c_bill", fields: { source: "Published engagement", function: "Finance", role: "Fractional CFO", operator: "Pat Example", start: "2026-01", status: "Active", type: "Fractional" } },
    { id: "e_bill_cmo", companyId: "c_bill", fields: { source: "Published engagement", function: "Marketing", role: "Fractional CMO", operator: "Sam Sample", start: "2025-06", status: "Active", type: "Fractional" } },
  ],
  // Two people there: with fellow fractionals free (PEERS_FREE), a warm path that costs is a person's name.
  contacts: [
    { id: "p_bill_ceo", companyId: "c_bill", fields: { name: "Quinn Example", title: "CEO", relationship: "Decision maker" } },
    { id: "p_bill_vp", companyId: "c_bill", fields: { name: "Rory Sample", title: "VP Finance", relationship: "Decision maker" } },
  ],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const at0 = new Date().toISOString();
const seen = Object.fromEntries(seed.members.map((m) => [m.id, at0]));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    // Al unlocked Ledgerline Labs before (every company is locked for a member until they unlock it or know it; who held a seat opens after it).
    unlocks: { "c_bill.identity": ["mem_al"] },
    seen,
    // Bo finished onboarding before billing was switched on. Al hasn't yet.
    profiles: { mem_bo: { function: "Marketing", onboarded: true }, mem_cy: { function: "Sales", onboarded: true }, mem_di: { function: "Finance", onboarded: true }, mem_ed: { function: "Operations", onboarded: true, looking: false }, mem_ad: { function: "Technology", onboarded: true } },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_ADMIN_EMAILS: "ada.admin@example.com",
});
const STRIPE_ENV = {
  STRIPE_SECRET_KEY: "sk_test_madeup_not_a_key",
  STRIPE_WEBHOOK_SECRET: "whsec_madeup_test_secret",
  STRIPE_PRICE_MONTH: "price_month_test",
  STRIPE_PRICE_YEAR: "price_year_test",
  STRIPE_PRICE_CLOSE_MONTH: "price_close_month_test",
  STRIPE_PRICE_CLOSE_YEAR: "price_close_year_test",
  STRIPE_PRICE_TOPUP: "price_topup_test",
  STRIPE_PRICE_AIPACK: "price_aipack_test",
  STRIPE_API_URL: "http://stripe.test",
  RN_SURVEY_CODE: "RN-SURVEY10",
  STRIPE_PROMO_SURVEY: "promo_survey_test",
};
const clearBilling = () => {
  for (const k of ["RN_BILLING", ...Object.keys(STRIPE_ENV)]) delete process.env[k];
};
for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_EMAIL_API_URL", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT"]) delete process.env[k];
clearBilling();

/* Nothing leaves the machine: Stripe and email calls are caught and answered here. */
type Call = { url: string; method: string; body: string; auth: string | null };
const calls: Call[] = [];
const mails: { to: string; subject: string; text: string }[] = [];
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  const body = typeof init?.body === "string" ? init.body : "";
  const headers = new Headers(init?.headers);
  if (url.startsWith("http://stripe.test/")) {
    calls.push({ url, method: init?.method ?? "GET", body, auth: headers.get("authorization") });
    const p = new URL(url).pathname;
    if (p === "/v1/checkout/sessions") return Response.json({ id: "cs_test_1", url: "https://checkout.stripe.test/c/cs_test_1" });
    if (p === "/v1/billing_portal/sessions") return Response.json({ id: "bps_1", url: "https://billing.stripe.test/p/bps_1" });
    if (p.startsWith("/v1/subscriptions/")) return Response.json({ id: p.split("/").pop(), items: { data: [{ id: "si_test_1" }] } });
    return Response.json({ error: { message: "nope" } }, { status: 404 });
  }
  if (url.startsWith("http://mail.test/")) {
    const m = JSON.parse(body) as { to: string[]; subject: string; text: string };
    mails.push({ to: m.to[0], subject: m.subject, text: m.text });
    return Response.json({ id: "mail_1" });
  }
  return new Response("{}", { status: 404 });
}) as typeof fetch;

const iso = (ms: number) => new Date(ms).toISOString();

async function main() {
  const plan = await import("../lib/plan.ts");
  const R = await import("../lib/billing/rules.ts");
  const S = await import("../lib/billing/stripe.ts");

  /* ---------- 1. pure ---------- */
  console.log("\nPlans over time (billing on)");
  process.env.RN_BILLING = "1";
  const T0 = Date.parse("2026-11-01T12:00:00Z");
  const tr = R.startTrial(undefined, T0)!;
  check("a trial starts with 21 days", !!tr && Date.parse(tr.trialEndsAt!) - T0 === 21 * DAY && tr.trialStartedAt === iso(T0), tr);
  check("it is the trial on day 1 and day 21, Free after", plan.planOf(tr, T0) === "trial" && plan.planOf(tr, T0 + 21 * DAY - 1) === "trial" && plan.planOf(tr, T0 + 21 * DAY) === "free");
  check("Pro and the trial both have Pro", plan.hasPro(tr, T0) && plan.hasPro({ proUntil: iso(T0 + DAY) }, T0) && !plan.hasPro({}, T0));
  check("days left count down to the last day", plan.trialDaysLeft(tr, T0) === 21 && plan.trialDaysLeft(tr, T0 + 20.5 * DAY) === 1 && plan.trialDaysLeft(tr, T0 + 22 * DAY) === null);
  check("the trial-ending moment is the last 3 days", !R.trialEnding(tr, T0 + 17 * DAY) && R.trialEnding(tr, T0 + 18 * DAY) && R.trialEnding(tr, T0 + 20.9 * DAY) && !R.trialEnding(tr, T0 + 21 * DAY));
  check("a second trial never starts", R.startTrial(tr, T0 + 30 * DAY) === null && R.startTrial({ paidSince: iso(T0) }, T0) === null && R.startTrial({ proUntil: iso(T0) }, T0) === null);
  check("paid Pro outranks the trial, a pause outranks both", plan.planOf({ ...tr, proUntil: iso(T0 + 40 * DAY) }, T0 + 20 * DAY) === "pro" && plan.planOf({ ...tr, pausedUntil: iso(T0 + 2 * DAY) }, T0) === "free");

  console.log("\nThe extension, once");
  const ex = { ...tr };
  check("value early in the trial changes nothing", !R.extendTrial(ex, T0 + 5 * DAY) && ex.trialEndsAt === tr.trialEndsAt);
  check("value in the last 4 days adds 7 days", R.extendTrial(ex, T0 + 17.5 * DAY) && Date.parse(ex.trialEndsAt!) === T0 + 28 * DAY && ex.trialExtended === true, ex);
  check("only once", !R.extendTrial(ex, T0 + 25 * DAY) && Date.parse(ex.trialEndsAt!) === T0 + 28 * DAY);
  const over = { ...tr };
  check("not after the trial ended", !R.extendTrial(over, T0 + 22 * DAY) && !over.trialExtended);

  console.log("\nPause and cancel");
  const paid = { subscriptionId: "sub_1", customerId: "cus_1", proUntil: iso(T0 + 10 * DAY), paidSince: iso(T0 - 20 * DAY), interval: "month" as const };
  check("no subscription, no pause", "why" in R.pauseDates({}, T0));
  const pd = R.pauseDates(paid, T0) as { from: string; until: string };
  check("a pause starts when the paid period ends and lasts a month", pd.from === paid.proUntil && pd.until === R.addMonths(paid.proUntil, 1), pd);
  const paused = { ...paid, pausedFrom: pd.from, pausedUntil: pd.until };
  check("Pro until the pause, Free in it, no second pause", plan.planOf(paused, T0 + 5 * DAY) === "pro" && plan.planOf(paused, T0 + 15 * DAY) === "free" && R.pauseState(paused, T0 + 15 * DAY) === "now" && "why" in R.pauseDates(paused, T0));
  check("Pro again once the next period is paid", plan.planOf({ ...paused, proUntil: R.addMonths(pd.until, 1) }, Date.parse(pd.until) + DAY) === "pro");
  const cancelled = { ...paid, cancelAt: paid.proUntil };
  check("cancel keeps Pro to the end of the paid period, then Free", plan.planOf(cancelled, T0 + 9 * DAY) === "pro" && plan.planOf(cancelled, T0 + 11 * DAY) === "free" && "why" in R.pauseDates(cancelled, T0));

  console.log("\nThe monthly credits");
  const mon = { ...paid, invoiceId: "in_1", periodStart: iso(T0 - 20 * DAY) };
  check("a monthly invoice is one grant", R.dueGrantRef(mon, T0) === "plan.in_1.0");
  const yr = { subscriptionId: "sub_y", interval: "year" as const, invoiceId: "in_y", periodStart: "2026-01-15T00:00:00.000Z", proUntil: "2027-01-15T00:00:00.000Z" };
  check("a yearly invoice has a grant each month", R.dueGrantRef(yr, Date.parse("2026-01-20T00:00:00Z")) === "plan.in_y.0" && R.dueGrantRef(yr, Date.parse("2026-03-16T00:00:00Z")) === "plan.in_y.2" && R.dueGrantRef(yr, Date.parse("2027-01-10T00:00:00Z")) === "plan.in_y.11");
  check("no credits on the trial, when paused or after Pro", R.dueGrantRef(tr, T0) === null && R.dueGrantRef({ ...mon, pausedUntil: iso(T0 + DAY) }, T0) === null && R.dueGrantRef(mon, T0 + 11 * DAY) === null);

  console.log("\nThe webhook signature");
  const secret = "whsec_madeup_test_secret";
  const body = JSON.stringify({ id: "evt_sig", type: "ping", data: { object: {} } });
  const nowS = Math.floor(T0 / 1000);
  check("a good signature passes", S.verifySignature(body, S.signFor(body, secret, nowS), secret, nowS) === "ok");
  check("a changed body fails", S.verifySignature(body.replace("ping", "pong"), S.signFor(body, secret, nowS), secret, nowS) === "bad");
  check("another secret fails", S.verifySignature(body, S.signFor(body, "whsec_other", nowS), secret, nowS) === "bad");
  check("an old one fails", S.verifySignature(body, S.signFor(body, secret, nowS - 600), secret, nowS) === "old");
  check("no header, or a malformed one, fails", S.verifySignature(body, null, secret, nowS) === "missing" && S.verifySignature(body, "t=abc,v1=zz", secret, nowS) === "bad");
  check("any of several v1 signatures may match", S.verifySignature(body, `${S.signFor(body, "whsec_old", nowS)},v1=${S.signFor(body, secret, nowS).split("v1=")[1]}`, secret, nowS) === "ok");

  console.log("\nEach event, once");
  const b = R.emptyBilling();
  const who = (o: { ref?: string | null; customer?: string | null; subscription?: string | null }) =>
    o.ref === "rn_ref_di" ? "mem_di" : Object.entries(b.members).find(([, r]) => (o.customer && r.customerId === o.customer) || (o.subscription && r.subscriptionId === o.subscription))?.[0] ?? null;
  const ctx = (ms: number) => ({ nowMs: ms, memberOf: who });
  const ev = (id: string, type: string, object: Record<string, unknown>) => ({ id, type, data: { object } });
  const co = R.applyEvent(b, ev("evt_1", "checkout.session.completed", { id: "cs_1", mode: "subscription", client_reference_id: "rn_ref_di", customer: "cus_di", subscription: "sub_di", payment_status: "paid", metadata: { interval: "month" } }), ctx(T0));
  check("checkout: Pro at once, with the customer and subscription", co.handled && plan.planOf(b.members.mem_di, T0) === "pro" && b.members.mem_di.customerId === "cus_di" && b.members.mem_di.subscriptionId === "sub_di" && b.members.mem_di.paidSince === iso(T0), b.members.mem_di);
  check("the same event again changes nothing", R.applyEvent(b, ev("evt_1", "checkout.session.completed", {}), ctx(T0)).why === "duplicate");
  const end1 = Math.floor((T0 + 30 * DAY) / 1000);
  const inv = (id: string, start: number, end: number, reason: string, cents = 5900) => ({ id, customer: "cus_di", subscription: "sub_di", billing_reason: reason, amount_paid: cents, lines: { data: [{ period: { start, end }, price: { recurring: { interval: "month" } } }] } });
  const ip = R.applyEvent(b, ev("evt_2", "invoice.paid", inv("in_1", nowS, end1, "subscription_create")), ctx(T0 + 1000));
  check("invoice.paid: Pro to the period's end, 100 credits once, no receipt for the first", ip.handled && b.members.mem_di.proUntil === iso(end1 * 1000) && ip.grants.length === 1 && ip.grants[0].delta === 100 && ip.grants[0].ref === "plan.in_1.0" && !ip.receipt, ip);
  check("money in is counted in cents", b.payments.length === 1 && b.payments[0].cents === 5900 && b.payments[0].kind === "month");
  const end2 = end1 + 30 * 86_400;
  const ren = R.applyEvent(b, ev("evt_3", "invoice.paid", inv("in_2", end1, end2, "subscription_cycle")), ctx(end1 * 1000 + 1000));
  check("a renewal: a new month's credits and the value receipt for the month before", ren.grants[0]?.ref === "plan.in_2.0" && ren.receipt?.memberId === "mem_di" && ren.receipt?.from === iso(nowS * 1000) && ren.receipt?.to === iso(end1 * 1000), ren);
  const up = R.applyEvent(b, ev("evt_4", "customer.subscription.updated", { id: "sub_di", customer: "cus_di", cancel_at_period_end: true, items: { data: [{ current_period_end: end2, price: { recurring: { interval: "month" } } }] } }), ctx(end1 * 1000 + 2000));
  check("subscription.updated: cancel at the period's end", up.handled && b.members.mem_di.cancelAt === iso(end2 * 1000));
  R.applyEvent(b, ev("evt_5", "customer.subscription.updated", { id: "sub_di", customer: "cus_di", cancel_at_period_end: false, pause_collection: { behavior: "void", resumes_at: end2 + 30 * 86_400 } }), ctx(end1 * 1000 + 3000));
  check("taking cancel back, then a pause from the portal", !b.members.mem_di.cancelAt && b.members.mem_di.pausedUntil === iso((end2 + 30 * 86_400) * 1000) && b.members.mem_di.pausedFrom === iso(end2 * 1000), b.members.mem_di);
  R.applyEvent(b, ev("evt_6", "customer.subscription.updated", { id: "sub_di", customer: "cus_di", cancel_at_period_end: false, pause_collection: null }), ctx(end1 * 1000 + 4000));
  check("the pause ended", !b.members.mem_di.pausedUntil && !b.members.mem_di.pausedFrom);
  const del = R.applyEvent(b, ev("evt_7", "customer.subscription.deleted", { id: "sub_di", customer: "cus_di" }), ctx(end1 * 1000 + 5000));
  check("subscription.deleted: no subscription, Pro to the paid end, counted as ended", del.handled && !b.members.mem_di.subscriptionId && plan.planOf(b.members.mem_di, end1 * 1000 + 6000) === "pro" && plan.planOf(b.members.mem_di, end2 * 1000 + 1) === "free" && b.ended.length === 1);
  const tu = R.applyEvent(b, ev("evt_8", "checkout.session.completed", { id: "cs_top", mode: "payment", client_reference_id: "rn_ref_di", payment_status: "paid", amount_total: 1900, metadata: { kind: "topup" } }), ctx(T0));
  check("a top-up: 50 credits, once, with its money", tu.grants.length === 1 && tu.grants[0].delta === 50 && tu.grants[0].reason === "topup" && tu.grants[0].ref === "topup.cs_top" && b.payments.some((x) => x.kind === "topup" && x.cents === 1900));
  const tuUnpaid = R.applyEvent(b, ev("evt_9", "checkout.session.completed", { id: "cs_top2", mode: "payment", client_reference_id: "rn_ref_di", payment_status: "unpaid", metadata: { kind: "topup" } }), ctx(T0));
  check("an unpaid top-up grants nothing", !tuUnpaid.handled && tuUnpaid.grants.length === 0);
  check("an event about nobody we know changes nothing", R.applyEvent(b, ev("evt_10", "invoice.paid", { id: "in_x", customer: "cus_nobody", subscription: "sub_nobody" }), ctx(T0)).why === "unknown member");
  check("events we don't use are noted and left", R.applyEvent(b, ev("evt_11", "charge.refunded", {}), ctx(T0)).why === "ignored" && b.events.includes("evt_11"));
  // The newer API shape: the subscription under parent.subscription_details.
  const b2 = R.emptyBilling();
  b2.members.mem_di = { customerId: "cus_n", subscriptionId: "sub_n" };
  const newer = R.applyEvent(b2, ev("evt_n", "invoice.paid", { id: "in_n", customer: "cus_n", parent: { subscription_details: { subscription: "sub_n" } }, amount_paid: 59000, lines: { data: [{ period: { start: nowS, end: nowS + 365 * 86_400 }, pricing: {}, price: { recurring: { interval: "year" } } }] } }), { nowMs: T0, memberOf: (o) => (o.subscription === "sub_n" ? "mem_di" : null) });
  check("the newer invoice shape (parent.subscription_details) works, yearly", newer.handled && b2.members.mem_di.interval === "year" && newer.grants[0]?.ref === "plan.in_n.0", b2.members.mem_di);

  console.log("\nBought during the trial: Stripe's trialing status");
  const trialRec = R.startTrial(undefined, T0)!;
  const trialEndS = Math.floor(Date.parse(trialRec.trialEndsAt!) / 1000);
  check("checkout keeps the trial's days with more than 48 hours left", R.keepTrialEnd(trialRec, T0 + 2 * DAY) === trialEndS && R.keepTrialEnd(trialRec, T0 + 18.9 * DAY) === trialEndS);
  check("48 hours or less left, or not on the trial: charged at once", R.keepTrialEnd(trialRec, T0 + 19 * DAY) === null && R.keepTrialEnd(trialRec, T0 + 20 * DAY) === null && R.keepTrialEnd({}, T0) === null && R.keepTrialEnd(paid, T0) === null);
  const bt = R.emptyBilling();
  bt.members.mem_tr = { ...trialRec };
  const whoT = (o: { ref?: string | null; customer?: string | null; subscription?: string | null }) =>
    o.ref === "rn_ref_tr" ? "mem_tr" : Object.entries(bt.members).find(([, r]) => (o.customer && r.customerId === o.customer) || (o.subscription && r.subscriptionId === o.subscription))?.[0] ?? null;
  const ctxT = (ms: number) => ({ nowMs: ms, memberOf: whoT });
  const tBuy = T0 + 3 * DAY;
  const tBuyS = Math.floor(tBuy / 1000);
  const trialInv = (id: string, start: number, end: number, reason: string, cents: number, meta: Record<string, unknown> = {}) => ({
    id,
    customer: "cus_tr",
    parent: { subscription_details: { subscription: "sub_tr", metadata: { ref: "rn_ref_tr", ...meta } } },
    billing_reason: reason,
    amount_paid: cents,
    lines: { data: [{ period: { start, end }, price: { recurring: { interval: "year" } } }] },
  });
  // Stripe may send the trial's $0 invoice before the checkout: the invoice's own metadata says it's the trial's.
  const zero = R.applyEvent(bt, ev("evt_t0", "invoice.paid", trialInv("in_t0", tBuyS, trialEndS, "subscription_create", 0, { trial_end: String(trialEndS) })), ctxT(tBuy));
  const trAfterZero = { ...bt.members.mem_tr };
  check(
    "the trial's $0 invoice: no credits, no money in, not the first paid month, Pro held to the trial's end",
    zero.handled && zero.grants.length === 0 && !zero.receipt && bt.payments.length === 0 && !trAfterZero.invoiceId && !trAfterZero.paidSince && trAfterZero.proStartsAt === iso(trialEndS * 1000),
    trAfterZero,
  );
  const coT = R.applyEvent(
    bt,
    ev("evt_t1", "checkout.session.completed", { id: "cs_tr", mode: "subscription", client_reference_id: "rn_ref_tr", customer: "cus_tr", subscription: "sub_tr", payment_status: "no_payment_required", metadata: { interval: "year", trial_end: String(trialEndS) } }),
    ctxT(tBuy + 1000),
  );
  const trS = bt.members.mem_tr;
  check(
    "checkout during the trial: subscribed, Pro starts at the trial's end, nothing paid yet",
    coT.handled && coT.grants.length === 0 && trS.subscriptionId === "sub_tr" && trS.interval === "year" && trS.proStartsAt === iso(trialEndS * 1000) && !trS.paidSince && R.proStartsLater(trS, tBuy) && plan.planOf(trS, tBuy) === "pro",
    trS,
  );
  check("no Pro credits while trialing", R.dueGrantRef(trS, tBuy + DAY) === null);
  check("Pro all the way through the trial's end and while the first charge goes through", plan.planOf(trS, trialEndS * 1000 - 1) === "pro" && plan.planOf(trS, trialEndS * 1000 + 3_600_000) === "pro");
  check("no pause before Pro has started", "why" in R.pauseDates(trS, tBuy));
  const subT = (id: string, extra: Record<string, unknown>) =>
    ev(id, "customer.subscription.updated", { id: "sub_tr", customer: "cus_tr", status: "trialing", trial_end: trialEndS, metadata: { ref: "rn_ref_tr" }, items: { data: [{ current_period_end: trialEndS, price: { recurring: { interval: "year" } } }] }, ...extra });
  R.applyEvent(bt, subT("evt_t2", { cancel_at_period_end: false }), ctxT(tBuy + 2000));
  check("subscription.updated, trialing: still subscribed, Pro starts at the trial's end", trS.proStartsAt === iso(trialEndS * 1000) && !trS.cancelAt && plan.planOf(trS, trialEndS * 1000 + 3_600_000) === "pro", trS);
  R.applyEvent(bt, subT("evt_t3", { cancel_at_period_end: true }), ctxT(tBuy + 3000));
  check("cancelled while trialing: Pro to the trial's end, then Free, nothing charged", trS.cancelAt === iso(trialEndS * 1000) && trS.proUntil === iso(trialEndS * 1000) && plan.planOf(trS, trialEndS * 1000 - 1) === "pro" && plan.planOf(trS, trialEndS * 1000 + 1) === "free", trS);
  R.applyEvent(bt, subT("evt_t4", { cancel_at_period_end: false }), ctxT(tBuy + 4000));
  check("taken back: Pro through the first charge again", !trS.cancelAt && plan.planOf(trS, trialEndS * 1000 + 3_600_000) === "pro", trS);
  const yearEndS = trialEndS + 365 * 86_400;
  const first = R.applyEvent(bt, ev("evt_t5", "invoice.paid", trialInv("in_t1", trialEndS, yearEndS, "subscription_cycle", 59000, { trial_end: String(trialEndS) })), ctxT(trialEndS * 1000 + 60_000));
  check(
    "the first paid invoice, when the trial ends: 100 credits, money in, Pro to the period's end, no renewal receipt",
    first.grants.length === 1 && first.grants[0].delta === 100 && first.grants[0].ref === "plan.in_t1.0" && !first.receipt && bt.payments.length === 1 && bt.payments[0].cents === 59000 && trS.proUntil === iso(yearEndS * 1000) && !trS.proStartsAt && trS.paidSince === iso(trialEndS * 1000 + 60_000),
    { first, trS },
  );
  const renT = R.applyEvent(bt, ev("evt_t6", "invoice.paid", trialInv("in_t2", yearEndS, yearEndS + 365 * 86_400, "subscription_cycle", 59000)), ctxT(yearEndS * 1000 + 60_000));
  check("the next year's renewal sends the receipt as usual", !!renT.receipt && renT.grants[0]?.ref === "plan.in_t2.0", renT);
  // Ended inside the trial, before any charge: back to the member's own trial, not counted as churn.
  const bd = R.emptyBilling();
  bd.members.mem_tr = { ...trialRec };
  R.applyEvent(bd, ev("evt_d1", "checkout.session.completed", { id: "cs_d", mode: "subscription", client_reference_id: "rn_ref_tr", customer: "cus_tr", subscription: "sub_tr", payment_status: "no_payment_required", metadata: { interval: "month", trial_end: trialEndS } }), { nowMs: tBuy, memberOf: (o) => (o.ref === "rn_ref_tr" || o.subscription === "sub_tr" ? "mem_tr" : null) });
  R.applyEvent(bd, ev("evt_d2", "customer.subscription.deleted", { id: "sub_tr", customer: "cus_tr", status: "canceled" }), { nowMs: tBuy + DAY, memberOf: (o) => (o.subscription === "sub_tr" ? "mem_tr" : null) });
  check("deleted inside the trial, nothing paid: the trial carries on to its end, not churn", plan.planOf(bd.members.mem_tr, tBuy + DAY) === "trial" && !bd.members.mem_tr.subscriptionId && !bd.members.mem_tr.proStartsAt && bd.ended.length === 0, bd.members.mem_tr);
  // Bought with 2 days or less left: an ordinary checkout, charged at once (no trial_end in its metadata).
  const bn = R.emptyBilling();
  bn.members.mem_tr = { ...trialRec };
  R.applyEvent(bn, ev("evt_n1", "checkout.session.completed", { id: "cs_n", mode: "subscription", client_reference_id: "rn_ref_tr", customer: "cus_tr", subscription: "sub_tr", payment_status: "paid", metadata: { interval: "month" } }), { nowMs: T0 + 20 * DAY, memberOf: () => "mem_tr" });
  check("late in the trial: paid at once, Pro from now", plan.planOf(bn.members.mem_tr, T0 + 20 * DAY) === "pro" && !bn.members.mem_tr.proStartsAt && bn.members.mem_tr.paidSince === iso(T0 + 20 * DAY));

  console.log("\nThe annual line");
  check("framed by an hourly rate above $49", R.annualLine(R.hourlyOf({ kind: "hourly", amount: 175 })) === "Less than an hour of your time a month.");
  check("a retainer counts over about 60 hours", R.annualLine(R.hourlyOf({ kind: "monthly", amount: 9000 })) !== null && R.annualLine(R.hourlyOf({ kind: "monthly", amount: 2000 })) === null);
  check("no rate, no line", R.annualLine(R.hourlyOf(null)) === null);
  check("the upgrade address", plan.upgradeUrl("https://post.example.com/", "radar") === "https://post.example.com/?p=billing&plans=1&from=radar");
  delete process.env.RN_BILLING;

  /* ---------- 2. billing off ---------- */
  const t = await import("../lib/table.ts");
  const tools = await import("../lib/mcp/tools.ts");
  const server = await import("../lib/billing/server.ts");
  const AL = "tok-al-0001";
  const BO = "tok-bo-0001";
  const CY = "tok-cy-0001";
  const DI = "tok-di-0001";
  const ED = "tok-ed-0001";
  const AD = "tok-ad-0001";
  const act = async (token: string, a: Parameters<typeof t.perform>[1]) => {
    try {
      return { ok: true as const, ...(await t.perform(token, a, "https://post.example.com")) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, message: "", id: undefined };
    }
  };
  const meOf = async (token: string) => (await t.buildView(token)).me!;
  const state = () => t.loadState();
  const save = (token: string, n: number) =>
    act(token, { type: "savedView", op: "save", name: `View ${n}`, place: `v=hiring&t=seats&f=fn:Finance~q${n}`, criteria: { function: "Finance", hq: `Place ${n}` } });

  console.log("\nBilling off: nothing changes");
  check("off by default", !plan.billingOn() && !plan.billingLive() && !plan.gated(undefined, Date.now()));
  const pOff = await act(AL, { type: "profile", function: "Sales", clientCount: "2", looking: true });
  const alOff = await meOf(AL);
  check("onboarding finishes as before, with the two answers kept", pOff.ok && alOff.onboarded && alOff.clientCount === "2" && alOff.looking === true, pOff);
  check("no plan in the view and no billing state", alOff.plan === undefined && !(await state()).billing);
  const v1 = await save(CY, 1);
  const v2 = await save(CY, 2);
  const v3 = await save(CY, 3);
  check("any number of saved views", v1.ok && v2.ok && v3.ok && (await meOf(CY)).savedViews?.length === 3, [v1, v2, v3]);
  const benchOff = (await t.buildView(CY)).benchmarks;
  check("the benchmarks are whole: every client-size row, never limited", !!benchOff && !benchOff.limited && benchOff.rows.some((r) => r.revenue !== "All"));
  check("no Claude cap, every Slack alert", (await t.claudePerDay("mem_cy")) === null && t.alertKindOpen(await state(), "mem_cy", "message"));
  await t.billingVisit(BO);
  check("a visit starts no trial", !(await state()).billing);
  check("the webhook answers 400 and changes nothing", (await server.handleWebhook("{}", null)).status === 400 && !(await state()).billing);
  let refused = "";
  try {
    await server.billingAction(DI, "checkout", { interval: "month" });
  } catch (e) {
    refused = (e as Error).message;
  }
  check("billing actions are refused in words, and nothing reaches Stripe", refused === "Plans aren't open yet." && calls.length === 0, refused);
  const codeOff = await act(CY, { type: "promoCode", code: "RN-SURVEY10" });
  check("a discount code from the address is not kept while billing is off", codeOff.ok && !(await state()).profiles.mem_cy?.promo && (await meOf(CY)).plan === undefined, codeOff);

  console.log("\nRN_BILLING=1 without Stripe: still off");
  process.env.RN_BILLING = "1";
  check("billing is not live", plan.billingOn() && !plan.billingLive());
  await t.billingVisit(BO);
  check("no trial, no plan, nothing gated", !(await state()).billing && (await meOf(BO)).plan === undefined && (await t.claudePerDay("mem_cy")) === null);

  /* ---------- 4. billing live ---------- */
  console.log("\nBilling live: the trial");
  Object.assign(process.env, STRIPE_ENV);
  check("live with the Stripe settings", plan.billingLive());
  // Al finished onboarding while billing was off: their trial starts on their next visit, like Bo's.
  await t.billingVisit(BO);
  const bo = await meOf(BO);
  check("a member onboarded before billing starts the trial on their next visit", bo.plan?.name === "trial" && bo.plan.trialDaysLeft === 21 && bo.plan.firstChargeAt === bo.plan.trialEndsAt, bo.plan);
  const ref0 = (await state()).billing!.members.mem_bo.trialEndsAt;
  await t.billingVisit(BO);
  check("a second visit changes nothing", (await state()).billing!.members.mem_bo.trialEndsAt === ref0);
  // A new member: the trial starts when onboarding is done, not before.
  await t.joinMember("Fay Newcomer", "fay.newcomer@example.com", "Fractional VP Marketing").catch(() => null);
  const fay = await t.memberByEmail("fay.newcomer@example.com");
  if (fay) {
    await t.billingVisit(fay.token);
    check("a member still in onboarding has no trial", !(await state()).billing!.members[fay.id] && (await meOf(fay.token)).plan?.name === "free");
    await act(fay.token, { type: "onboardDraft", draft: { step: 1, function: "Marketing", title: "", icp: null, before: null, roles: true, email: true, clientCount: "0", looking: false, clients: [], views: [], saved: null, at: new Date().toISOString() } });
    check("onboarding's draft keeps the two answers", (await meOf(fay.token)).draft?.clientCount === "0" && (await meOf(fay.token)).draft?.looking === false);
    const f1 = (await meOf(fay.token)).plan;
    check("in onboarding the trial is ahead (onboarding's words for it): Free, none had yet, no card", f1?.name === "free" && !f1.hadTrial && !f1.trialStarted, f1);
    await act(fay.token, { type: "profile", function: "Marketing", clientCount: "0", looking: false });
    const f2 = (await meOf(fay.token)).plan;
    check("finishing onboarding starts the 21-day trial", f2?.name === "trial" && f2.trialDaysLeft === 21 && f2.notLooking, f2);
    check("Home's one-time trial card is due once the trial starts", f2?.trialStarted === true, f2);
    const seenStart = await act(fay.token, { type: "noticeSeen", kind: "trialStarted" });
    check("Got it: the trial card is closed for good, kept in the plan's notices", seenStart.ok && !(await meOf(fay.token)).plan?.trialStarted && !!(await state()).billing!.members[fay.id].notices?.trialStartedSeen, seenStart);
    check("Bo, whose trial started at his visit, gets the card too", (await meOf(BO)).plan?.trialStarted === true);
    const bad = await act(fay.token, { type: "profile", clientCount: "7" });
    check("a client count off the list is refused", !bad.ok);
  } else check("a new member could join", false);

  // Cy: a trial that ended. Di: paid Pro. Ed: a trial in its last days, not looking.
  const now = Date.now();
  await t.tableInternals.mutate((s) => {
    s.billing!.members.mem_cy = { trialStartedAt: iso(now - 20 * DAY), trialEndsAt: iso(now - 6 * DAY) };
    s.billing!.members.mem_ed = { trialStartedAt: iso(now - 12 * DAY), trialEndsAt: iso(now + 2 * DAY) };
    s.billing!.members.mem_al = { trialStartedAt: iso(now - 11 * DAY), trialEndsAt: iso(now + 3 * DAY - 60_000) };
    s.billing!.members.mem_ad = { trialStartedAt: iso(now - 30 * DAY), trialEndsAt: iso(now - 16 * DAY) };
  });
  const cy = await meOf(CY);
  check("after the trial: Free, quietly, with the limits, charged at checkout", cy.plan?.name === "free" && cy.plan.hadTrial && cy.plan.firstChargeAt === null && cy.plan.limits.savedViews === 1 && cy.plan.limits.claudePerDay === 20, cy.plan);
  const ed = await meOf(ED);
  check("the last 3 days: the trial-ending moment; 2 days left, so buying now is charged at once", ed.plan?.ending === true && ed.plan.firstChargeAt === null && ed.plan.trialDaysLeft === 2 && ed.plan.notLooking);
  // Today's one-time trial-ended card (UX round, WS1): on until closed, then kept closed with the plan's notices.
  check("the trial ended: Today's card is due", cy.plan?.trialEnded === true && !ed.plan?.trialEnded, { cy: cy.plan?.trialEnded, ed: ed.plan?.trialEnded });
  const seenCard = await act(CY, { type: "noticeSeen", kind: "trialEnded" });
  check("Got it: the card is closed for good, kept in the plan's notices", seenCard.ok && !(await meOf(CY)).plan?.trialEnded && !!(await state()).billing!.members.mem_cy.notices?.trialEndedSeen, seenCard);

  console.log("\nFree's limits");
  const v4 = await save(CY, 4);
  check("a new saved view on Free is refused (they have one)", !v4.ok && v4.error === t.SAVED_VIEW_FREE && (await meOf(CY)).savedViews?.length === 3, v4);
  const again = await act(CY, { type: "savedView", op: "save", name: "Same", place: `v=hiring&t=seats&f=fn:Finance~q1`, criteria: { function: "Finance", hq: "Place 1" } });
  check("saving one they have still answers with that view", again.ok && /already/.test(again.message), again);
  const ren2 = await act(CY, { type: "savedView", op: "rename", id: (await meOf(CY)).savedViews![0].id, name: "Renamed" });
  check("renaming and removing still work", ren2.ok);
  const cyTool = { member: (await t.memberForToken(CY))!, origin: "https://post.example.com" };
  let toolRefused = "";
  try {
    await tools.alerts(cyTool, { action: "save", name: "From Claude", function: "Sales", industry: ["SaaS"] });
  } catch (e) {
    toolRefused = (e as Error).message;
  }
  check("Claude's saved searches have the same limit, with the plans link", /Free plan you keep 1 saved search/.test(toolRefused) && toolRefused.includes("/?p=billing&plans=1&from=claude_views"), toolRefused);
  const s4 = await state();
  const firstOnly = t.tableInternals.alertViewsOf(s4, "mem_cy", s4.connector!.alerts.mem_cy);
  check("alerts and the weekly email use the first saved view only", firstOnly.length === 1 && firstOnly[0].id === s4.connector!.alerts.mem_cy[0].id);
  const bench = (await t.buildView(CY)).benchmarks!;
  check("benchmarks on Free: medians by function, no ranges, no client-size rows", bench.limited === true && bench.rows.every((r) => r.revenue === "All" && r.monthly.p25 === undefined && r.hourly.p75 === undefined));
  check("Claude: 20 requests a day on Free", (await t.claudePerDay("mem_cy")) === 20);
  check("Slack: the weekly roles post on Free, nothing else", t.alertKindOpen(s4, "mem_cy", "roles") && !t.alertKindOpen(s4, "mem_cy", "message") && !t.alertKindOpen(s4, "mem_cy", "seat"));
  check("the trial has everything", (await t.claudePerDay("mem_bo")) === null && t.alertKindOpen(s4, "mem_bo", "message") && !(await t.buildView(BO)).benchmarks!.limited);
  const bv1 = await save(BO, 11);
  const bv2 = await save(BO, 12);
  check("saved views on the trial are unlimited", bv1.ok && bv2.ok);
  const forRadar = await t.planFor("mem_cy");
  check("planFor (for the radar): Free is gated, the trial is not", forRadar.gated && !forRadar.pro && (await t.planFor("mem_bo")).pro && !(await t.planFor("mem_bo")).gated);

  console.log("\nThe extension");
  // A warm path that costs is a person's name now: who held a seat is free (PEERS_FREE).
  const alCo = (await t.buildView(AL)).companies[0];
  const [pubCeo, pubVp] = alCo.people.map((p) => p.id);
  const beforeEnd = (await state()).billing!.members.mem_al.trialEndsAt!;
  const un = await act(AL, { type: "unlock", entity: "contact", id: pubCeo, field: "name" });
  const afterEnd = (await state()).billing!.members.mem_al.trialEndsAt!;
  check("unlocking a warm path in the last days adds 7 days", un.ok && Date.parse(afterEnd) - Date.parse(beforeEnd) === 7 * DAY && (await meOf(AL)).plan?.trialExtended === true, { un, beforeEnd, afterEnd });
  await act(AL, { type: "unlock", entity: "contact", id: pubVp, field: "name" });
  check("and only once", (await state()).billing!.members.mem_al.trialEndsAt === afterEnd);

  console.log("\nThe webhook, end to end");
  const ref = t.tableInternals.billingRef("mem_di");
  check("the ref at Stripe is opaque: no id, no name", /^rn_[A-Za-z0-9_-]{24}$/.test(ref) && !/mem_|payer/i.test(ref));
  const hook = async (e: object, opts: { secret?: string; ts?: number } = {}) => {
    const raw = JSON.stringify(e);
    return server.handleWebhook(raw, S.signFor(raw, opts.secret ?? STRIPE_ENV.STRIPE_WEBHOOK_SECRET, opts.ts ?? Math.floor(Date.now() / 1000)));
  };
  const credits0 = (await meOf(DI)).credits;
  const bad = await hook({ id: "evt_w0", type: "checkout.session.completed", data: { object: { mode: "subscription", client_reference_id: ref, payment_status: "paid" } } }, { secret: "whsec_wrong" });
  const old = await hook({ id: "evt_w0", type: "checkout.session.completed", data: { object: { mode: "subscription", client_reference_id: ref, payment_status: "paid" } } }, { ts: Math.floor(Date.now() / 1000) - 3600 });
  check("a bad or old signature is 400 and changes nothing", bad.status === 400 && old.status === 400 && !(await state()).billing!.members.mem_di);
  const w1 = await hook({ id: "evt_w1", type: "checkout.session.completed", data: { object: { id: "cs_w1", mode: "subscription", client_reference_id: ref, customer: "cus_w", subscription: "sub_w", payment_status: "paid", metadata: { ref, interval: "year" } } } });
  const diPlan = (await meOf(DI)).plan;
  check("checkout.session.completed: Pro, yearly", w1.status === 200 && diPlan?.name === "pro" && diPlan.interval === "year" && diPlan.subscribed && diPlan.portal, diPlan);
  const nowSec = Math.floor(Date.now() / 1000);
  const paidInv = { id: "evt_w2", type: "invoice.paid", data: { object: { id: "in_w1", customer: "cus_w", subscription: "sub_w", billing_reason: "subscription_create", amount_paid: 59000, lines: { data: [{ period: { start: nowSec, end: nowSec + 365 * 86_400 }, price: { recurring: { interval: "year" } } }] } } } };
  const w2 = await hook(paidInv);
  const w2again = await hook(paidInv);
  const w2twin = await hook({ ...paidInv, id: "evt_w2b" });
  const diMe = await meOf(DI);
  check("invoice.paid: 100 credits, once, however often it comes", w2.status === 200 && w2again.status === 200 && w2again.body.why === "duplicate" && w2twin.status === 200 && diMe.credits === credits0 + 100, { credits0, now: diMe.credits, w2again: w2again.body });
  await t.billingVisit(DI);
  check("a visit in the same month grants nothing more", (await meOf(DI)).credits === credits0 + 100);
  check("the credits read as Pro's in the history", (await t.buildView(DI)).ledger.some((l) => l.reason === "Pro credits for the month" && l.delta === 100));
  const top = { id: "evt_w3", type: "checkout.session.completed", data: { object: { id: "cs_w3", mode: "payment", client_reference_id: ref, customer: "cus_w", payment_status: "paid", amount_total: 1900, metadata: { ref, kind: "topup" } } } };
  await hook(top);
  await hook(top);
  await hook({ ...top, id: "evt_w3b" });
  check("a top-up: 50 credits, once", (await meOf(DI)).credits === credits0 + 150 && (await t.buildView(DI)).ledger.some((l) => l.reason === "Bought 50 credits"));
  // A yearly plan: the next month's credits come on a visit (or the sweep), once.
  await t.tableInternals.mutate((s) => {
    s.billing!.members.mem_di.periodStart = iso(Date.now() - 40 * DAY);
  });
  await t.billingVisit(DI);
  await t.billingVisit(DI);
  check("a yearly plan's next month: 100 more, once", (await meOf(DI)).credits === credits0 + 250);
  await t.tableInternals.mutate((s) => {
    s.billing!.members.mem_di.periodStart = iso(Date.now() - 2 * DAY);
  });

  console.log("\nCheckout, the portal, cancel and pause");
  calls.length = 0;
  const ck = await server.billingAction(CY, "checkout", { interval: "month" }, "https://post.example.com");
  const ckBody = new URLSearchParams(calls[0]?.body ?? "");
  check(
    "checkout: Stripe Checkout for the monthly price, email prefilled, codes allowed, our ref only",
    ck.url === "https://checkout.stripe.test/c/cs_test_1" &&
      calls[0]?.method === "POST" &&
      ckBody.get("mode") === "subscription" &&
      ckBody.get("line_items[0][price]") === "price_month_test" &&
      ckBody.get("customer_email") === "cy.freeman@example.com" &&
      ckBody.get("allow_promotion_codes") === "true" &&
      ckBody.get("client_reference_id") === t.tableInternals.billingRef("mem_cy") &&
      !(calls[0]?.body ?? "").includes("mem_cy") &&
      calls[0]?.auth === `Bearer ${STRIPE_ENV.STRIPE_SECRET_KEY}`,
    calls[0],
  );
  calls.length = 0;
  await server.billingAction(CY, "checkout", { interval: "year", code: " rn-survey10 " }, "https://post.example.com");
  const ck2 = new URLSearchParams(calls[0]?.body ?? "");
  check("the survey code is applied as its promotion code (and the yearly price)", ck2.get("discounts[0][promotion_code]") === "promo_survey_test" && !ck2.has("allow_promotion_codes") && ck2.get("line_items[0][price]") === "price_year_test");
  // From the landing page (?code=RN-SURVEY10) through joining: the code is kept with the member, shown on the plans and applied at checkout untyped.
  await t.joinMember("Gil Surveyed", "gil.surveyed@example.com", undefined, "10.9.9.9", null, "rn-survey10");
  const gil = await t.memberByEmail("gil.surveyed@example.com");
  if (gil) {
    await act(gil.token, { type: "profile", function: "Sales", clientCount: "1", looking: true });
    const gp = (await meOf(gil.token)).plan;
    check("a code brought through joining shows on the plans: RN-SURVEY10 applied, 10% off", gp?.code?.code === "RN-SURVEY10" && gp.code.off === "10% off", gp?.code);
    calls.length = 0;
    await server.billingAction(gil.token, "checkout", { interval: "month" }, "https://post.example.com");
    const ck3 = new URLSearchParams(calls[0]?.body ?? "");
    check("and checkout applies it without it being typed again", ck3.get("discounts[0][promotion_code]") === "promo_survey_test" && !ck3.has("allow_promotion_codes"), calls[0]?.body);
  } else check("a member could join with a code", false);
  const codeLive = await act(DI, { type: "promoCode", code: "rn-survey10" });
  check("a signed-in member's code from the address is kept too (promoCode)", codeLive.ok && (await meOf(DI)).plan?.code?.code === "RN-SURVEY10");
  check("a member with no code has none on the plans", (await meOf(BO)).plan?.code === null);
  calls.length = 0;
  const tp = await server.billingAction(CY, "topup", {}, "https://post.example.com");
  const tpBody = new URLSearchParams(calls[0]?.body ?? "");
  check("top-up: a one-time Checkout for 50 credits", !!tp.url && tpBody.get("mode") === "payment" && tpBody.get("line_items[0][price]") === "price_topup_test" && tpBody.get("metadata[kind]") === "topup");
  let already = "";
  try {
    await server.billingAction(DI, "checkout", { interval: "month" });
  } catch (e) {
    already = (e as Error).message;
  }
  check("no second subscription for a member on Pro", /on Pro already/.test(already));
  calls.length = 0;
  const pt = await server.billingAction(DI, "portal", {}, "https://post.example.com");
  check("the portal opens for the customer", pt.url === "https://billing.stripe.test/p/bps_1" && new URLSearchParams(calls[0]?.body ?? "").get("customer") === "cus_w");
  calls.length = 0;
  const cn = await server.billingAction(DI, "cancel", {});
  const cnBody = new URLSearchParams(calls[0]?.body ?? "");
  const diCancel = (await meOf(DI)).plan!;
  check("cancel: at the period's end at Stripe, Pro until then here", /Cancelled/.test(cn.message ?? "") && cnBody.get("cancel_at_period_end") === "true" && diCancel.cancelAt === diCancel.proUntil && diCancel.name === "pro", diCancel);
  let noPause = "";
  try {
    await server.billingAction(DI, "pause", {});
  } catch (e) {
    noPause = (e as Error).message;
  }
  check("a cancelled plan isn't paused", /Keep Pro first/.test(noPause));
  calls.length = 0;
  await server.billingAction(DI, "keep", {});
  check("keep: cancel taken back", new URLSearchParams(calls[0]?.body ?? "").get("cancel_at_period_end") === "false" && !(await meOf(DI)).plan!.cancelAt);
  calls.length = 0;
  const ps = await server.billingAction(DI, "pause", {});
  const psBody = new URLSearchParams(calls[0]?.body ?? "");
  const diPause = (await meOf(DI)).plan!;
  check(
    "pause: no invoices for a month from the period's end, Pro until then",
    /Paused for a month/.test(ps.message ?? "") && psBody.get("pause_collection[behavior]") === "void" && Number(psBody.get("pause_collection[resumes_at]")) === Math.floor(Date.parse(diPause.pausedUntil!) / 1000) && diPause.pause === "booked" && diPause.name === "pro",
    { ps, diPause },
  );
  calls.length = 0;
  await server.billingAction(DI, "resume", {});
  check("resume: the pause is off at Stripe and here", (calls[0]?.body ?? "").includes("pause_collection=") && !(await meOf(DI)).plan!.pause);
  check("the secret key never reaches the browser's plan", !JSON.stringify(await t.buildView(DI)).includes(STRIPE_ENV.STRIPE_SECRET_KEY) && !JSON.stringify((await meOf(DI)).plan).includes("cus_w"));

  console.log("\nThe trial notices");
  Object.assign(process.env, { RESEND_API_KEY: "re_madeup", RN_EMAIL_FROM: "Merlin <post@example.com>", RN_EMAIL_API_URL: "http://mail.test/emails" });
  // Al's trial ran a week longer (the extension above): put its end back in the last 3 days.
  await t.tableInternals.mutate((s) => {
    s.billing!.members.mem_al.trialEndsAt = iso(Date.now() + 2.5 * DAY);
  });
  mails.length = 0;
  const sw = await server.sweep();
  const to = (who: string) => mails.filter((m) => m.to === who);
  check("Al (3 days left, looking): the 3-day note", to("al.trialson@example.com").length === 1 && /ends in \d+ days/.test(to("al.trialson@example.com")[0].subject), to("al.trialson@example.com").map((m) => m.subject));
  check(
    "it is the value receipt with Keep Pro, in place of a countdown (one email, not two)",
    /what your trial gave you so far|still yours for a few days/.test(to("al.trialson@example.com")[0]?.text ?? "") && /After it ends you're on Free, unless you keep Pro/.test(to("al.trialson@example.com")[0]?.text ?? "") && /\$590 a year/.test(to("al.trialson@example.com")[0]?.text ?? ""),
    to("al.trialson@example.com")[0]?.text,
  );
  const alEnd = (await meOf(AL)).plan!;
  check("the app has the receipt in the trial's last 3 days (Plan and billing, the banner)", alEnd.ending && Array.isArray(alEnd.receipt), alEnd);
  check("and not earlier in the trial", (await meOf(BO)).plan!.receipt === undefined);
  check("Ed (not looking): no countdown at 2 days", to("ed.quietly@example.com").length === 0);
  check("Cy (ended 6 days ago): the value receipt with the yearly plan first", to("cy.freeman@example.com").length === 1 && /trial is over/.test(to("cy.freeman@example.com")[0].subject) && /\$590 a year, which is 2 months free, or \$59 a month/.test(to("cy.freeman@example.com")[0].text));
  check("Ada (ended 16 days ago): too long ago, nothing", to("ada.admin@example.com").length === 0);
  check("no email names another member", mails.every((m) => !seed.members.some((x) => x.email !== m.to && m.text.includes(x.name.split(" ")[0] + " " + x.name.split(" ")[1]))));
  mails.length = 0;
  await server.sweep();
  check("each notice once", mails.length === 0, mails.map((m) => m.to));
  await t.tableInternals.mutate((s) => {
    s.billing!.members.mem_ed.trialEndsAt = iso(Date.now() + 12 * 3600_000);
  });
  await server.sweep();
  const edLast = to("ed.quietly@example.com");
  check("Ed's last day: one soft note, no price", edLast.length === 1 && /tomorrow/.test(edLast[0].subject) && /Nothing to do/.test(edLast[0].text) && !/\$\d/.test(edLast[0].text), edLast);
  check("the sweep counted what it sent", sw.sent === 2);
  delete process.env.RESEND_API_KEY;

  console.log("\nPilot metrics");
  const adm = (await t.buildView(AD)).admin?.billing;
  check(
    "the billing panel: plans, trial to paid, MRR, churn, top-ups",
    !!adm && adm.pro === 1 && adm.trial >= 3 && adm.trialsEnded >= 2 && adm.trialsPaid === 0 && adm.mrrCents === Math.round(59000 / 12) && adm.topups === 1 && adm.topupCents === 1900 && adm.churnMonth === 0,
    adm,
  );
  await hook({ id: "evt_w9", type: "customer.subscription.deleted", data: { object: { id: "sub_w", customer: "cus_w" } } });
  const adm2 = (await t.buildView(AD)).admin?.billing;
  check("a subscription that ends counts as churn this month and leaves MRR", adm2?.churnMonth === 1 && adm2.mrrCents === 0, adm2);
  check("members never see the panel", !(await t.buildView(CY)).admin);

  console.log("\nUpgrading during the trial, end to end");
  const boP = (await meOf(BO)).plan!;
  const boEndS = Math.floor(Date.parse(boP.trialEndsAt!) / 1000);
  check("on the trial the plans show, and buying now waits for the trial's end", boP.name === "trial" && boP.firstChargeAt === boP.trialEndsAt && !boP.proStartsAt, boP);
  calls.length = 0;
  await server.billingAction(BO, "checkout", { interval: "year" }, "https://post.example.com");
  const boCk = new URLSearchParams(calls[0]?.body ?? "");
  check(
    "checkout with more than 48 hours left: subscription_data[trial_end] is the trial's end, in the metadata too",
    Number(boCk.get("subscription_data[trial_end]")) === boEndS && Number(boCk.get("metadata[trial_end]")) === boEndS && Number(boCk.get("subscription_data[metadata][trial_end]")) === boEndS && boCk.get("line_items[0][price]") === "price_year_test",
    calls[0]?.body,
  );
  calls.length = 0;
  await server.billingAction(ED, "checkout", { interval: "month" }, "https://post.example.com");
  const edCk = new URLSearchParams(calls[0]?.body ?? "");
  check("with 48 hours or less left: no trial_end, charged at once", calls.length === 1 && !edCk.has("subscription_data[trial_end]") && !edCk.has("metadata[trial_end]") && (await meOf(ED)).plan!.firstChargeAt === null);
  const boRef = t.tableInternals.billingRef("mem_bo");
  const boCredits0 = (await meOf(BO)).credits;
  await hook({ id: "evt_b1", type: "checkout.session.completed", data: { object: { id: "cs_b1", mode: "subscription", client_reference_id: boRef, customer: "cus_bo", subscription: "sub_bo", payment_status: "no_payment_required", metadata: { ref: boRef, interval: "year", trial_end: String(boEndS) } } } });
  await hook({ id: "evt_b2", type: "invoice.paid", data: { object: { id: "in_b0", customer: "cus_bo", parent: { subscription_details: { subscription: "sub_bo", metadata: { ref: boRef, trial_end: String(boEndS) } } }, billing_reason: "subscription_create", amount_paid: 0, lines: { data: [{ period: { start: Math.floor(Date.now() / 1000), end: boEndS }, price: { recurring: { interval: "year" } } }] } } } });
  const boSub = (await meOf(BO)).plan!;
  check(
    "subscribed while trialing: Pro, yearly, starting at the trial's end, with the portal",
    boSub.name === "pro" && boSub.subscribed && boSub.portal && boSub.interval === "year" && Math.floor(Date.parse(boSub.proStartsAt ?? "") / 1000) === boEndS && boSub.trialDaysLeft === null && !boSub.cancelAt,
    boSub,
  );
  check("the trial's $0 invoice brings no credits", (await meOf(BO)).credits === boCredits0);
  check("no Stripe id reaches the browser", !JSON.stringify(boSub).includes("cus_bo") && !JSON.stringify(boSub).includes("sub_bo") && !JSON.stringify(boSub).includes("in_b0"));
  let boPause = "";
  try {
    await server.billingAction(BO, "pause", {});
  } catch (e) {
    boPause = (e as Error).message;
  }
  check("no pause before Pro has started", /Nothing is charged until your trial ends/.test(boPause), boPause);
  calls.length = 0;
  const boCn = await server.billingAction(BO, "cancel", {});
  const boCnPlan = (await meOf(BO)).plan!;
  check("cancel while trialing: nothing charged, Pro to the trial's end", /Nothing is charged/.test(boCn.message ?? "") && new URLSearchParams(calls[0]?.body ?? "").get("cancel_at_period_end") === "true" && boCnPlan.cancelAt === boCnPlan.proStartsAt && boCnPlan.name === "pro", { boCn, boCnPlan });
  const boKp = await server.billingAction(BO, "keep", {});
  check("keep: the first charge comes at the trial's end", /first charge comes on/.test(boKp.message ?? "") && !(await meOf(BO)).plan!.cancelAt, boKp);
  // The trial's end: Stripe charges the first year. Its invoice.paid brings the month's 100 credits.
  const atEnd = boEndS * 1000 + 60_000;
  const firstPaid = JSON.stringify({ id: "evt_b3", type: "invoice.paid", data: { object: { id: "in_b1", customer: "cus_bo", parent: { subscription_details: { subscription: "sub_bo", metadata: { ref: boRef, trial_end: String(boEndS) } } }, billing_reason: "subscription_cycle", amount_paid: 59000, lines: { data: [{ period: { start: boEndS, end: boEndS + 365 * 86_400 }, price: { recurring: { interval: "year" } } }] } } } });
  const fp = await server.handleWebhook(firstPaid, S.signFor(firstPaid, STRIPE_ENV.STRIPE_WEBHOOK_SECRET, Math.floor(atEnd / 1000)), undefined, atEnd);
  const boPaid = (await meOf(BO)).plan!;
  check("the first paid invoice: 100 credits, Pro to the year's end, the wait over", fp.status === 200 && (await meOf(BO)).credits === boCredits0 + 100 && boPaid.name === "pro" && !boPaid.proStartsAt && Math.floor(Date.parse(boPaid.proUntil!) / 1000) === boEndS + 365 * 86_400, { fp, boPaid });

  /* ---------- Pro + Close ---------- */
  console.log("\nPro + Close: the tier, its checkout, events, upgrade and downgrade, the one gate");
  {
    const N = Date.now();
    const trialRec = R.startTrial(undefined, N)!;
    check("the trial is Close: canClose true, tierNow close", R.canClose(trialRec, N) && R.tierNow(trialRec, N) === "close");
    check("Free is refused", !R.canClose(undefined, N) && !R.canClose({ trialStartedAt: iso(N - 30 * DAY), trialEndsAt: iso(N - 9 * DAY) }, N) && R.tierNow(undefined, N) === "free");
    const proRec = { proUntil: iso(N + 20 * DAY), paidSince: iso(N - 10 * DAY), tier: "pro" as const };
    check("plain Pro is refused", !R.canClose(proRec, N) && R.tierNow(proRec, N) === "pro");
    check("paid Pro + Close has it", R.canClose({ ...proRec, tier: "close" }, N) && R.tierNow({ ...proRec, tier: "close" }, N) === "close");
    check("the prices: $79 a month, $790 a year, the same 100 credits", R.PRICES.closeMonth === 79 && R.PRICES.closeYear === 790 && R.tierPrice("close", "year") === 790 && R.tierPrice("pro", "month") === 59 && R.PRO_CREDITS === 100);
    // Paid Pro from before Close: stays on Pro, with Close until the next renewal.
    const gb = R.emptyBilling();
    gb.members.old = { proUntil: iso(N + 12 * DAY), paidSince: iso(N - 50 * DAY), invoiceId: "in_old", interval: "month" };
    gb.members.lapsed = { proUntil: iso(N - DAY), paidSince: iso(N - 90 * DAY) };
    gb.members.trial = { trialStartedAt: iso(N), trialEndsAt: iso(N + 21 * DAY) };
    check("grandfathering: only paid Pro now, once", R.grandfatherClose(gb, N) === 1 && gb.members.old.tier === "pro" && gb.members.old.closeUntil === gb.members.old.proUntil && !gb.members.lapsed.tier && !gb.members.trial.tier && R.grandfatherClose(gb, N) === 0);
    check("  Close features until the next renewal", R.canClose(gb.members.old, N + 11 * DAY) && R.tierNow(gb.members.old, N) === "pro");
    const renewed = { ...gb.members.old, proUntil: iso(N + 42 * DAY) };
    check("  then plain Pro", !R.canClose(renewed, N + 13 * DAY) && plan.planOf(renewed, N + 13 * DAY) === "pro");
    // Events: the tier from checkout's metadata, and from the subscription's price on an upgrade or a downgrade.
    const cb = R.emptyBilling();
    const cctx = (nowMs: number) => ({ nowMs, memberOf: () => "mem_x", tierOf: S.tierOfPrice });
    R.applyEvent(cb, ev("evt_c1", "checkout.session.completed", { id: "cs_c1", mode: "subscription", client_reference_id: "rn_ref_x", customer: "cus_x", subscription: "sub_x", payment_status: "paid", metadata: { interval: "month", tier: "close" } }), cctx(N));
    check("checkout for Pro + Close: on Close at once", cb.members.mem_x.tier === "close" && R.canClose(cb.members.mem_x, N) && plan.planOf(cb.members.mem_x, N) === "pro");
    R.applyEvent(cb, ev("evt_c2", "customer.subscription.updated", { id: "sub_x", customer: "cus_x", status: "active", items: { data: [{ price: { id: "price_month_test", recurring: { interval: "month" } }, current_period_end: Math.floor((N + 30 * DAY) / 1000) }] } }), cctx(N));
    check("a downgrade (the subscription's price is Pro's): on Pro, Close closed", cb.members.mem_x.tier === "pro" && !R.canClose(cb.members.mem_x, N));
    R.applyEvent(cb, ev("evt_c3", "customer.subscription.updated", { id: "sub_x", customer: "cus_x", status: "active", items: { data: [{ price: { id: "price_close_month_test", recurring: { interval: "month" } }, current_period_end: Math.floor((N + 30 * DAY) / 1000) }] } }), cctx(N));
    check("an upgrade (Close's price): on Close again", cb.members.mem_x.tier === "close" && R.canClose(cb.members.mem_x, N));
    R.applyEvent(cb, ev("evt_c4", "invoice.paid", { id: "in_c4", customer: "cus_x", subscription: "sub_x", amount_paid: 7900, lines: { data: [{ period: { start: Math.floor(N / 1000), end: Math.floor((N + 30 * DAY) / 1000) }, price: { id: "price_close_month_test", recurring: { interval: "month" } } }] } }), cctx(N));
    check("its invoice: Close, with the same 100 credits a month", cb.members.mem_x.tier === "close" && cb.members.mem_x.cents === 7900);
    check("a price we don't know leaves the tier as it is", S.tierOfPrice("price_unknown") === null && S.tierOfPrice(null) === null);
    // Checkout and the moves between tiers, through the server, Stripe answered here.
    calls.length = 0;
    await server.billingAction(CY, "checkout", { interval: "month", tier: "close" }, "https://post.example.com");
    const ckc = new URLSearchParams(calls[0]?.body ?? "");
    check("checkout for Pro + Close: Close's monthly price, the tier in both metadata", ckc.get("line_items[0][price]") === "price_close_month_test" && ckc.get("metadata[tier]") === "close" && ckc.get("subscription_data[metadata][tier]") === "close", calls[0]?.body);
    calls.length = 0;
    await server.billingAction(CY, "checkout", { interval: "year" }, "https://post.example.com");
    check("checkout for Pro is as before: Pro's price, tier pro", new URLSearchParams(calls[0]?.body ?? "").get("line_items[0][price]") === "price_year_test" && new URLSearchParams(calls[0]?.body ?? "").get("metadata[tier]") === "pro");
    // Di subscribes again (her earlier subscription ended above): yearly Pro, paid to a year from now.
    await t.tableInternals.mutate((st) => {
      const r = st.billing!.members.mem_di;
      r.subscriptionId = "sub_w2";
      r.proUntil = iso(Date.now() + 365 * DAY);
      r.interval = "year";
      r.tier = "pro";
      delete r.cancelAt;
      delete r.closeUntil;
      return null;
    });
    const diBefore = (await meOf(DI)).plan!;
    check("Di pays for Pro (yearly) and can't send proposals", diBefore.name === "pro" && diBefore.tier === "pro" && !diBefore.canClose && diBefore.prices.closeYear === 790, diBefore);
    const P = await import("../lib/proposals/store.ts");
    check("the proposals gate refuses plain Pro and Free, and opens on the trial", !(await P.listProposals(DI)).canSend && !(await P.listProposals(CY)).canSend && (await P.listProposals(AL)).canSend);
    calls.length = 0;
    const up = await server.billingAction(DI, "tier", { tier: "close" });
    const upBody = new URLSearchParams(calls.find((c) => c.method === "POST")?.body ?? "");
    check("upgrade on the same subscription: Close's yearly price, invoiced now", /Pro \+ Close now: \$790 a year/.test(up.message ?? "") && calls[0]?.method === "GET" && upBody.get("items[0][id]") === "si_test_1" && upBody.get("items[0][price]") === "price_close_year_test" && upBody.get("proration_behavior") === "always_invoice", { up, calls });
    const diClose = (await meOf(DI)).plan!;
    check("  Close at once: canClose, and proposals send", diClose.tier === "close" && diClose.canClose && (await P.listProposals(DI)).canSend, diClose);
    const again = await server.billingAction(DI, "tier", { tier: "close" }).then(() => null, (e: Error) => e.message);
    check("  asking again says so", /already/.test(again ?? ""), again);
    calls.length = 0;
    const down = await server.billingAction(DI, "tier", { tier: "pro" });
    const downBody = new URLSearchParams(calls.find((c) => c.method === "POST")?.body ?? "");
    check("downgrade: Pro's price, prorated to the next invoice", /You're on Pro now/.test(down.message ?? "") && downBody.get("items[0][price]") === "price_year_test" && downBody.get("proration_behavior") === "create_prorations", { down, body: downBody.toString() });
    check("  plain Pro again: proposals refused", !(await meOf(DI)).plan!.canClose && !(await P.listProposals(DI)).canSend);
    const noSub = await server.billingAction(CY, "tier", { tier: "close" }).then(() => null, (e: Error) => e.message);
    check("no subscription to move: refused", /no paid plan/.test(noSub ?? ""), noSub);

    // The AI usage pack: $10, once, on Pro + Close or the trial; the top-up's pattern.
    console.log("\nThe AI usage pack");
    check("its price and the plans' words, with no amount or limit", R.PRICES.aiPack === 10 && R.CLOSE_AI_LINE === "Claude drafts your proposals from your calls" && R.AI_PACK_LINE === "Need more AI usage? Add a pack anytime for $10." && !/\d+ (drafts|requests|tokens)|limit/i.test(R.AI_PACK_LINE + R.CLOSE_AI_LINE));
    const refusedFree = await server.billingAction(CY, "aipack", {}).then(() => null, (e: Error) => e.message);
    const refusedPro = await server.billingAction(DI, "aipack", {}).then(() => null, (e: Error) => e.message);
    check("refused on Free and on plain Pro, with the Close upgrade's words", refusedFree === server.AI_PACK_CLOSE && refusedPro === server.AI_PACK_CLOSE, [refusedFree, refusedPro]);
    calls.length = 0;
    const apk = await server.billingAction(AL, "aipack", {}, "https://post.example.com");
    const apBody = new URLSearchParams(calls[0]?.body ?? "");
    check("checkout on the trial: a one-time payment for the pack's price, kind aipack, our ref only", apk.url === "https://checkout.stripe.test/c/cs_test_1" && apBody.get("mode") === "payment" && apBody.get("line_items[0][price]") === "price_aipack_test" && apBody.get("metadata[kind]") === "aipack" && apBody.get("client_reference_id") === t.tableInternals.billingRef("mem_al") && !/mem_al|Al Trialson/.test(calls[0]?.body ?? ""), calls[0]?.body);
    const alRef = t.tableInternals.billingRef("mem_al");
    const pack = (id: string, session: string, status = "paid") => ({ id, type: "checkout.session.completed", data: { object: { id: session, mode: "payment", client_reference_id: alRef, payment_status: status, amount_total: 1000, metadata: { ref: alRef, kind: "aipack" } } } });
    const al0 = (await meOf(AL)).credits;
    const unpaid = await hook(pack("evt_ai0", "cs_ai0", "unpaid"));
    check("an unpaid session gives nothing", unpaid.status === 200 && !((await state()).billing!.aiPacks ?? []).length);
    const h1 = await hook(pack("evt_ai1", "cs_ai1"));
    const packs1 = (await state()).billing!.aiPacks ?? [];
    check("paid: onAiPackPaid records the pack for the member, once, and no credits", h1.status === 200 && packs1.length === 1 && packs1[0].memberId === "mem_al" && packs1[0].ref === "aipack.cs_ai1" && (await meOf(AL)).credits === al0, packs1);
    await hook(pack("evt_ai1", "cs_ai1"));
    await hook(pack("evt_ai2", "cs_ai1"));
    check("the same event again, or the same payment under another event: nothing more", ((await state()).billing!.aiPacks ?? []).length === 1);
    check("money in, as an AI pack, once", (await state()).billing!.payments.filter((x) => x.kind === "aipack").length === 1 && (await state()).billing!.payments.find((x) => x.kind === "aipack")?.cents === 1000);
    const AI = await import("../lib/billing/aiPack.ts");
    const ab = R.emptyBilling();
    check("the hook itself is idempotent on the payment ref", AI.onAiPackPaid(ab, "m1", "aipack.x") && !AI.onAiPackPaid(ab, "m1", "aipack.x") && AI.aiPacksBought(ab, "m1") === 1);
    check("the plan says the pack can be bought", (await meOf(AL)).plan!.aiPack === true);
  }

  console.log("\nSwitched off again: everything as before");
  clearBilling();
  const cyOff = await meOf(CY);
  check("no plan, nothing gated, the stored plans kept for later", cyOff.plan === undefined && (await t.claudePerDay("mem_cy")) === null && !(await t.buildView(CY)).benchmarks!.limited && !!(await state()).billing);
  const v5 = await save(CY, 5);
  check("saved views open again", v5.ok);
}

try {
  await main();
} catch (e) {
  failed++;
  console.log(`FAIL the suite stopped: ${(e as Error).stack ?? e}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${failed ? "FAILED" : "ok"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);

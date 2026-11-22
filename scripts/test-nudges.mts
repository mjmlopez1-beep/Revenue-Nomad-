/**
 * One nudge at a time (app/post/nudges.ts): pickNudge's order, its words, and two toasts from
 * one action read as one sentence. Pure, no server.
 *
 *   npx tsx scripts/test-nudges.mts
 */
import type { PlanView } from "../lib/tableTypes";
import { LOW_CREDITS, mergeToastText, pickNudge } from "../app/post/nudges";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      got ${JSON.stringify(detail)?.slice(0, 600)}`}`);
}

const plan = (x: Partial<PlanView>): PlanView =>
  ({
    name: "trial",
    trialEndsAt: "2026-12-01T00:00:00Z",
    trialDaysLeft: 12,
    trialExtended: false,
    hadTrial: true,
    ending: false,
    proUntil: null,
    interval: null,
    cancelAt: null,
    pause: null,
    pausedFrom: null,
    pausedUntil: null,
    subscribed: false,
    portal: false,
    firstChargeAt: null,
    proStartsAt: null,
    topup: true,
    notLooking: false,
    annualLine: null,
    prices: { month: 49, year: 490, topup: 10, topupCredits: 20, proCredits: 100 },
    code: null,
    limits: { savedViews: null, claudePerDay: null },
    ...x,
  }) as PlanView;
const step = { label: "Find your seats", hint: "up to ~12 credits a seat", action: "seats" };
const base = { page: "today", credits: 20, profileEmpty: false };

console.log("The order");
const ending = plan({ ending: true, trialDaysLeft: 3 });
const all = pickNudge({ ...base, credits: 1, plan: ending, profileEmpty: true, nextStep: step });
check("the trial's last days come first, on Today", all?.kind === "trial" && all.text === "Your Close trial ends in 3 days. Then you're on Free, unless you choose Pro." && all.cta === "Choose Pro" && all.action === "plans", all);
check("only on Today: on the table the credits come first", pickNudge({ ...base, page: "table", credits: 1, plan: ending, profileEmpty: true, nextStep: step })?.kind === "credits");
check("a trial with more than 3 days left is no nudge", pickNudge({ ...base, plan: plan({ trialDaysLeft: 12 }) }) === null);
check("the last day says tomorrow", pickNudge({ ...base, plan: plan({ ending: true, trialDaysLeft: 1 }) })?.text.startsWith("Your Close trial ends tomorrow.") === true);
check("not looking: the soft form", pickNudge({ ...base, plan: plan({ ending: true, trialDaysLeft: 2, notLooking: true }) })?.cta === "See plans");
check("Pro and Free have no trial nudge", pickNudge({ ...base, plan: plan({ name: "pro", ending: true }) }) === null && pickNudge({ ...base, plan: plan({ name: "free", ending: true }) }) === null);
const low = pickNudge({ ...base, credits: LOW_CREDITS, profileEmpty: true, nextStep: step });
check("then 3 credits or fewer", low?.kind === "credits" && low.text === "3 credits left. Add a fact you know and earn one." && low.action === "earn", low);
check("one credit is one", pickNudge({ ...base, credits: 1 })?.text.startsWith("1 credit left.") === true);
check("none left says so", pickNudge({ ...base, credits: 0 })?.text.startsWith("You're out of credits.") === true);
check("4 credits is no credits nudge", pickNudge({ ...base, credits: 4 }) === null);
const prof = pickNudge({ ...base, profileEmpty: true, nextStep: step });
check("then an empty profile", prof?.kind === "profile" && prof.action === "profile", prof);
const next = pickNudge({ ...base, nextStep: step });
check("then the next Get started step, as one line", next?.kind === "step" && next.text === "Next: Find your seats · up to ~12 credits a seat" && next.action === "seats", next);
check("a step without a hint", pickNudge({ ...base, nextStep: { label: "Invite a fractional", action: "invite" } })?.text === "Next: Invite a fractional");
check("then nothing", pickNudge(base) === null);
check("billing off (no plan) still nudges on credits", pickNudge({ page: "table", credits: 2, profileEmpty: false })?.kind === "credits");

console.log("\nCopy");
const every = [all, low, prof, next].filter(Boolean);
check("never names LinkedIn or Sales Navigator", every.every((n) => !/linkedin|sales navigator/i.test(`${n!.text} ${n!.cta}`)));
// WS1 runs these actions (Today and the table): plans, earn, profile, and the Get started step's own (unlock, holder, seats, fillSeats, invite).
check("every action is one WS1 runs", every.every((n) => ["plans", "earn", "profile", "unlock", "holder", "seats", "fillSeats", "invite"].includes(n!.action!)), every.map((n) => n!.action));
check("every nudge is one short line", every.every((n) => n!.text.length <= 80), every.map((n) => n!.text.length));

console.log("\nToasts from one action");
check(
  "two unlocks read as one sentence with the total",
  mergeToastText("Unlocked the seat holder and their role for 1 credit.", "Unlocked Acme for 2 credits.") === "Unlocked the seat holder and their role and Acme · 3 credits",
  mergeToastText("Unlocked the seat holder and their role for 1 credit.", "Unlocked Acme for 2 credits."),
);
check("one credit each", mergeToastText("Unlocked the company for 1 credit.", "Unlocked the seat holder and their role for 1 credit.") === "Unlocked the company and the seat holder and their role · 2 credits");
check("anything else: both sentences, whole", mergeToastText("Saved", "Added to the benchmarks.") === "Saved. Added to the benchmarks.");

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);

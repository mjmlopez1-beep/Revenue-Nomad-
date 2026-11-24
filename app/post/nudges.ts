"use client";

/**
 * One nudge at a time. A screen has at most one line that asks the member to do something
 * (Today and the table render one NudgeSlot in place of stacked banners). pickNudge is pure, so
 * scripts/test-nudges.mts checks it with no browser. In this order:
 *   1. the Close trial ends in 3 days or fewer (Today only),
 *   2. 3 credits or fewer,
 *   3. an empty profile (no Ideal Fractional Profile),
 *   4. the next Get started step, as one line ("Next: Find your seats · up to ~12 credits a seat"),
 *   5. nothing.
 *
 * Also here, because they belong to the same rule:
 *   - the trial line is showing (useTrialShowing): the top bar's Upgrade pill steps back while it does,
 *   - mergeToastText: two toasts from one action read as one sentence.
 */
import { createElement as h, useEffect, useSyncExternalStore } from "react";
import type { PlanView } from "@/lib/tableTypes";
import { TRIAL_NAME, keepVerb, keepWords } from "@/lib/billing/rules";

export type NudgeKind = "trial" | "credits" | "profile" | "step";
export interface Nudge {
  kind: NudgeKind;
  text: string;
  cta?: string;
  action?: string;
  /** More than one way out, in one line (out of credits: earn one, the top-up, Pro). Shown in place of `cta`. */
  choices?: { label: string; action: string; tone?: "earn" | "pine" }[];
}

/** Out of credits, the three ways to get one (Billing.tsx GetCredits says the same). */
export const EARN_ONE = "Earn one: add a fact";
export const PRO_COMPANIES_FREE = "Pro: everything opens";
export const topupWords = (plan: Pick<PlanView, "prices">) => `${plan.prices.topupCredits} for $${plan.prices.topup.toLocaleString("en-US")}`;
/** The three choices for a member at 0 credits: earning always, the top-up when it is set up, Pro off Pro. */
export function creditChoices(plan: PlanView | undefined): NonNullable<Nudge["choices"]> {
  return [
    { label: EARN_ONE, action: "earn", tone: "earn" as const },
    ...(plan?.topup ? [{ label: topupWords(plan), action: "topup" }] : []),
    ...(plan && plan.name !== "pro" ? [{ label: PRO_COMPANIES_FREE, action: "plansCredits", tone: "pine" as const }] : []),
  ];
}
export interface NudgeInput {
  page: string;
  credits: number;
  plan?: PlanView;
  profileEmpty: boolean;
  nextStep?: { label: string; hint?: string; action: string };
}

/** At or under this balance, the credits line is the nudge. */
export const LOW_CREDITS = 3;

const credits = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;

/** The one nudge for this screen, or null. */
export function pickNudge(x: NudgeInput): Nudge | null {
  const plan = x.plan;
  // Home shows the trial's summary card in its last days (Billing.tsx TrialSummaryCard): the nudge doesn't repeat it.
  if (x.page === "today" && plan?.name === "trial" && plan.ending && plan.trialDaysLeft != null && !(plan.summary && !plan.notLooking)) {
    const when = plan.trialDaysLeft <= 1 ? "ends tomorrow" : `ends in ${plan.trialDaysLeft} days`;
    return plan.notLooking
      ? { kind: "trial", text: `Your ${TRIAL_NAME} ${when}. Nothing to do: you stay on Free, with no charge.`, cta: "See plans", action: "plans" }
      : plan.keep === "close"
        ? { kind: "trial", text: `Your ${TRIAL_NAME} ${when}. Then you're on Free, unless you keep Close.`, cta: "Keep Close", action: "plans" }
        : { kind: "trial", text: `Your ${TRIAL_NAME} ${when}. Then you're on Free, unless you ${keepVerb("pro")}.`, cta: keepWords("pro"), action: "plans" };
  }
  // The out-of-credits wall is Free's only: on Pro, Close and the trial everything opens without credits but email and phone.
  if (x.credits <= LOW_CREDITS && plan?.name !== "pro" && plan?.name !== "trial") {
    // At 0: three ways out in one line (earn one, the top-up, Pro).
    if (x.credits <= 0) return { kind: "credits", text: "You're out of credits.", choices: creditChoices(plan) };
    return { kind: "credits", text: `${credits(x.credits)} left. Add a fact you know and earn one.`, cta: "Earn credits", action: "earn" };
  }
  if (x.profileEmpty) return { kind: "profile", text: "Tell us who you want to work with, and we rank companies for you.", cta: "Set your profile", action: "profile" };
  if (x.nextStep) {
    const s = x.nextStep;
    return { kind: "step", text: `Next: ${s.label}${s.hint ? ` · ${s.hint}` : ""}`, cta: "Start", action: s.action };
  }
  return null;
}

/**
 * The table's slot (TradingPost nudgeFor): which nudge shows is chosen from the balance as the list
 * opened (`x.credits`), so an unlock never pushes the rows; a credits line then reads the balance
 * now (`creditsNow`), one source with the top bar's pill (never "2 credits left" beside 0).
 */
export function pickSlotNudge(x: NudgeInput, creditsNow: number): Nudge | null {
  const n = pickNudge(x);
  if (n?.kind !== "credits" || creditsNow === x.credits) return n;
  return pickNudge({ ...x, credits: creditsNow });
}

/* ---------- the trial line is showing ---------- */

let trialShowing = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
/** True while a trial line (the trial nudge, or the trial banner) is on screen. */
export const useTrialShowing = () => useSyncExternalStore(subscribe, () => trialShowing > 0, () => false);
/** Call while a trial line is on screen: it counts itself in and out. */
export function useMarkTrialShowing(on: boolean) {
  useEffect(() => {
    if (!on) return;
    trialShowing++;
    emit();
    return () => {
      trialShowing--;
      emit();
    };
  }, [on]);
}

/* ---------- the slot ---------- */

/**
 * The one nudge, as one calm line: what is true and one thing to do about it. Nothing when
 * `nudge` is null. `onAction` gets the nudge's action (WS1's set: "plans", "earn", "profile", or the
 * Get started step's own). `onClose`: a way to put it away, where the caller keeps that.
 */
export function NudgeSlot({ nudge, onAction, onClose }: { nudge: Nudge | null; onAction: (action: string) => void; onClose?: () => void }) {
  useMarkTrialShowing(nudge?.kind === "trial");
  if (!nudge) return null;
  return h(
    "div",
    { className: `tp-strip nudge nudge-${nudge.kind}`, role: "status", "data-nudge": nudge.kind },
    h("span", { className: "tp-strip-t nudge-t", title: nudge.text }, nudge.text),
    nudge.choices?.length
      ? h(
          "span",
          { className: "nudge-choices", role: "group", "aria-label": "Ways to get credits" },
          ...nudge.choices.map((c) =>
            h("button", { key: c.action, type: "button", className: `btn btn-sm nudge-go${c.tone === "earn" ? " btn-volt" : c.tone === "pine" ? " btn-pine" : ""}`, onClick: () => onAction(c.action) }, c.label),
          ),
        )
      : null,
    !nudge.choices?.length && nudge.cta && nudge.action
      ? h("button", { type: "button", className: `btn btn-sm nudge-go${nudge.kind === "trial" || nudge.kind === "step" ? " btn-pine" : ""}`, onClick: () => onAction(nudge.action!) }, nudge.cta)
      : null,
    onClose
      ? h(
          "button",
          { type: "button", className: "tp-iconbtn tp-iconbtn-dark tp-iconbtn-sm nudge-x", "aria-label": "Dismiss", onClick: onClose },
          h("svg", { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", "aria-hidden": true }, h("path", { d: "M6 6l12 12M18 6L6 18" })),
        )
      : null,
  );
}

/* ---------- toasts from one action ---------- */

/** Two toasts this close together come from one action. */
export const TOAST_MERGE_MS = 1500;

const UNLOCKED = /^Unlocked (.+?)(?: for| ·) (\d+|one) credits?\.?$/i;
const FREE = /^Unlocked (.+?)(?:,| ·| for) free(?: [^.]*)?\.?$/i;
const words = (n: number) => (n === 0 ? "free" : credits(n));
const lower = (s: string) => s.replace(/^(The|A|An|Who) /, (m) => m.toLowerCase());

/**
 * Two toasts from one action as one sentence. Two unlocks: "Unlocked the company and who held
 * the seat · 3 credits". Anything else: the two sentences, each whole. Null when either one is
 * an error or carries its own action (Undo), which stay toasts of their own.
 */
export function mergeToastText(a: string, b: string): string {
  const ua = a.match(UNLOCKED) ?? a.match(FREE);
  const ub = b.match(UNLOCKED) ?? b.match(FREE);
  if (ua && ub) {
    const n = (m: RegExpMatchArray) => (m.length > 2 && m[2] ? (m[2].toLowerCase() === "one" ? 1 : Number(m[2])) : 0);
    return `Unlocked ${ua[1]} and ${lower(ub[1])} · ${words(n(ua) + n(ub))}`;
  }
  const end = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
  return `${end(a)} ${b.trim()}`;
}

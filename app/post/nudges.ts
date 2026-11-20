// [ux ws1 stub: WS3 replaces this file]
/**
 * One nudge at a time (BUILD-LIST item 4): the contract WS1 codes against until WS3's version
 * lands. pickNudge picks one, in this order: the trial ending (its last 3 days, on Today only),
 * credits at 3 or fewer, an empty profile, the next Get started step, else nothing. NudgeSlot draws
 * it as one line with at most one action.
 */
import { createElement as h } from "react";
import type { PlanView } from "@/lib/tableTypes";

export interface NudgeInput {
  page: string;
  credits: number;
  plan?: PlanView;
  profileEmpty: boolean;
  nextStep?: { label: string; hint?: string; action: string };
}
export interface Nudge {
  kind: "trial" | "credits" | "profile" | "step";
  text: string;
  cta?: string;
  action?: string;
}

export function pickNudge(input: NudgeInput): Nudge | null {
  const p = input.plan;
  if (input.page === "today" && p?.name === "trial" && p.ending)
    return { kind: "trial", text: `Your Pro trial ends ${p.trialDaysLeft === 1 ? "tomorrow" : `in ${p.trialDaysLeft} days`}.`, cta: p.notLooking ? "See plans" : "Keep Pro", action: "plans" };
  if (input.credits <= 3) return { kind: "credits", text: `${input.credits === 1 ? "1 credit" : `${input.credits} credits`} left. Add what you know to earn more.`, cta: "Earn credits", action: "earn" };
  if (input.profileEmpty) return { kind: "profile", text: "Tell us who you want to work with, and Crystal Ball finds them.", cta: "Set your profile", action: "profile" };
  if (input.nextStep) return { kind: "step", text: `Next: ${input.nextStep.label}${input.nextStep.hint ? ` · ${input.nextStep.hint}` : ""}`, cta: "Go", action: input.nextStep.action };
  return null;
}

export function NudgeSlot({ nudge, onAction }: { nudge: Nudge | null; onAction: (action: string) => void }) {
  if (!nudge) return null;
  return h(
    "div",
    { className: "tp-strip tp-nudge", role: "status", "data-kind": nudge.kind },
    h("span", { className: "tp-strip-t" }, nudge.text),
    nudge.action && nudge.cta ? h("span", { className: "tp-strip-acts" }, h("button", { type: "button", className: "btn btn-sm", onClick: () => onAction(nudge.action!) }, nudge.cta)) : null,
  );
}

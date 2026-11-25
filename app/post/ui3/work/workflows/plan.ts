/**
 * What a Simple workflow (or a template) will do, step by step, and what each step can cost: the
 * words of a template's preview before Use template (owner review M4), and the prices the card and
 * the editor quote. Pure: no React, no I/O, so scripts/test-ui3-work.mts can check it.
 *
 * Prices come from the engine (StepPrices, filled from lib/table.ts): a step is never quoted above
 * what it would spend now on the member's plan, and "No credits" only where the step spends nothing.
 */
import { SCOPE_SAY, TRIGGER_SAY, type SimpleCfg } from "@/lib/workflows/simple";
import type { StepPrices } from "@/lib/workflows/types";

export const creditWords = (n: number) => (n === 1 ? "1 credit" : `${n} credits`);
/** The monthly credit limit a template starts with (an enforced cap: the run pauses and asks at it). */
export const DEFAULT_CAP = 60;

/** What each paid Simple step costs this member now, from the engine's prices. */
export function stepPrice(p: StepPrices | undefined, cfg: SimpleCfg, step: "research" | "dm" | "email"): number {
  if (!p) return step === "email" ? 1 : 0;
  const company = cfg.scope.kind === "radar" && p.ballFree ? 0 : p.companyFull;
  if (step === "research") return company;
  if (step === "dm") return p.person + (cfg.research ? 0 : company);
  return (p.detail ?? 1) + (cfg.dm ? 0 : p.person + (cfg.research ? 0 : company));
}
/** The most a run of these stages can spend now: 0 means nothing in it costs credits on the plan. */
export const simpleCeiling = (p: StepPrices | undefined, cfg: SimpleCfg, paid: boolean) =>
  !paid ? 0 : (cfg.research ? stepPrice(p, cfg, "research") : 0) + (cfg.dm ? stepPrice(p, cfg, "dm") : 0) + (cfg.email ? stepPrice(p, cfg, "email") : 0);
/** The spending line of a template, said only when one of its steps can spend. */
export const capWords = (n: number) => (n ? `Up to ${creditWords(n)} a run, and it stops at ${DEFAULT_CAP} a month unless you change it` : "Nothing in it costs credits on your plan");

/** One step of a stage, with what it costs: credits, "No credits", or "On Pro" where the plan doesn't have it. */
export interface PlanStep {
  say: string;
  cost: string | null;
}
export interface PlanStage {
  n: "01" | "02" | "03" | "04";
  cls: "g1" | "g2" | "g3" | "g4";
  kicker: string;
  head?: string;
  steps: PlanStep[];
}

/**
 * Every stage of a template in full, for its preview: when it starts, each research and drafting
 * step with its price, where the member approves (and how they are asked), and each follow-up step.
 */
export function planStages(cfg: SimpleCfg, prices: StepPrices | undefined, paid: boolean): PlanStage[] {
  const say = TRIGGER_SAY[cfg.trigger];
  const price = (step: "research" | "dm" | "email") => (!paid ? "On Pro" : stepPrice(prices, cfg, step) ? creditWords(stepPrice(prices, cfg, step)) : "No credits");
  const free = "No credits";
  const does: PlanStep[] = [];
  if (cfg.research) does.push({ say: "Research the company", cost: price("research") });
  if (cfg.dm) does.push({ say: "Find the decision maker", cost: price("dm") });
  if (cfg.email) does.push({ say: "Find their email", cost: price("email") });
  if (cfg.way) does.push({ say: "Find my warmest way in", cost: free });
  does.push({ say: "Draft an introduction in my voice", cost: paid ? free : "On Pro" });
  const follows: PlanStep[] = [];
  if (cfg.follow.pipe) follows.push({ say: "Update my pipeline", cost: free });
  if (cfg.follow.reply) follows.push({ say: `Watch for a reply for ${cfg.follow.replyDays} days`, cost: free });
  if (cfg.follow.followup) follows.push({ say: "Prepare a follow-up, which waits for my approval too", cost: free });
  if (!follows.length) follows.push({ say: "Nothing more after I approve", cost: null });
  return [
    { n: "01", cls: "g1", kicker: "When this happens", head: say.head, steps: [{ say: `${say.line}${cfg.trigger === "known" ? "" : ` ${SCOPE_SAY[cfg.scope.kind] ?? ""}`}`.trim(), cost: null }] },
    { n: "02", cls: "g2", kicker: "Merlin does this", steps: does },
    {
      n: "03",
      cls: "g3",
      kicker: "I approve",
      head: "Nothing goes out without me.",
      steps: [
        { say: cfg.ask.email ? "Merlin asks me in in-app notifications and email" : "Merlin asks me in in-app notifications", cost: null },
        { say: "I review, edit or skip the draft before anything is sent", cost: null },
        { say: `Skipped if I don't answer in ${cfg.ask.days} days`, cost: null },
      ],
    },
    { n: "04", cls: "g4", kicker: "Merlin follows through", steps: follows },
  ];
}

/** The preview's spending line: the most a run can cost and the monthly limit that stops it. */
export function planSpendLine(cfg: SimpleCfg, prices: StepPrices | undefined, paid: boolean): string {
  if (!paid) return "Research and drafting are on Pro. Your approval stays yours on every plan.";
  const n = simpleCeiling(prices, cfg, paid);
  if (!n) return "Nothing in it costs credits on your plan.";
  return `Expected cost: up to ${creditWords(n)} a run. Monthly credit limit ${DEFAULT_CAP}: Merlin pauses spending at the limit and asks before continuing. You can change it before it goes live.`;
}

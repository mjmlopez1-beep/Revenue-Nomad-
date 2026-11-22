/**
 * Claude usage on Merlin's server (drafting a proposal: lib/proposals/draft.ts), metered in what
 * it costs: each call's usage.input_tokens at USD_PER_M_IN and usage.output_tokens at
 * USD_PER_M_OUT, from the API's own answer, kept in micro-dollars (whole numbers).
 *
 *  - Budget: members on Pro + Close (lib/billing/rules.ts canClose, everyone while billing is
 *    off) get MONTH_BUDGET_MICROS of Claude cost a UTC calendar month, starting again on the 1st.
 *    An active trial gets TRIAL_BUDGET_MICROS in total instead.
 *  - Packs: grantAiPack adds PACK_MICROS (a $PACK_PRICE_USD purchase), once per payment reference.
 *    A pack is used after the month's budget and never expires.
 *  - A call is allowed while any budget is left, so one call can take a member a little past 100%.
 *    Once the used share is 100% of the budget and the pack, new calls are refused.
 *  - Charged only after a successful call: a failure or a refusal costs nothing.
 *  - At 50%, 75% and 90% of the budget, a one-time notice in the app (each once a month: Me.plan.ai.notice).
 *
 * Members see a percentage only (aiMeter), never dollars or tokens, and no limit is advertised.
 * Pilot metrics' Health sums the month in counts and dollars for the owner (aiUsageTotals).
 * "Build it in Claude" (the copied prompt and the connector's kit) runs in the member's own Claude:
 * free and unlimited, never metered here.
 *
 * State.aiUsage[memberId]. Theirs alone: never in another member's view or the export.
 */
import type { State } from "../table";
import { planOf } from "../plan";
import { canClose } from "../billing/rules";

/** Dollars per million tokens: what a call is charged at. */
export const USD_PER_M_IN = 4;
export const USD_PER_M_OUT = 20;
/** Pro's Claude budget a UTC month, and an active trial's in total. */
export const MONTH_BUDGET_MICROS = 10_000_000;
export const TRIAL_BUDGET_MICROS = 3_000_000;
/** One AI usage pack: a $10 purchase that adds this much Claude usage (about half after Stripe's fees is margin). */
export const PACK_MICROS = 4_700_000;
export const PACK_PRICE_USD = 10;
/** The notices, in percent of the budget. */
export const AI_ALERTS = [50, 75, 90] as const;
export type AiAlert = (typeof AI_ALERTS)[number];
/** Where "Add a $10 usage pack" posts once billing has the route (the billing branch). */
export const AI_PACK_ROUTE = "/api/billing/ai-pack";
/** Until then the draft's button opens Settings, Plan. */
export const AI_PACK_LINK = "/?p=billing&plans=1&from=ai-pack";
export const PACK_BUTTON = `Add an AI usage pack, $${PACK_PRICE_USD}`;
/** A member's log keeps this many calls (newest last). */
export const LOG_KEEP = 200;

export interface AiUsageLog {
  at: string;
  inTok: number;
  outTok: number;
  micros: number;
}
/** State.aiUsage[memberId]. Numbers only, never a word of a call. */
export interface AiUsageRec {
  /** The UTC month ("YYYY-MM") usedMicros counts. A new month starts it again at 0. */
  month: string;
  usedMicros: number;
  /** Left in packs. Never expires. */
  packMicros: number;
  log: AiUsageLog[];
  /** An active trial's use, in total. */
  trialMicros?: number;
  /** Packs granted, by payment reference, so a payment grants once. */
  packs?: { ref: string; micros: number; at: string }[];
  /** The notices fired and seen, for one month ("trial" for the trial's). */
  alerts?: { month: string; fired: number[]; seen: number[] };
}

export const monthOf = (ms: number) => new Date(ms).toISOString().slice(0, 7);
/** The day the month's budget starts again: the 1st of next month (UTC), "YYYY-MM-DD". */
export function resetsOn(nowMs: number): string {
  const d = new Date(nowMs);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}
/** "December 1". */
export const dayWords = (isoDay: string) => new Date(`${isoDay}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
/** A call's cost in micro-dollars, from the API's usage. */
export const microsOf = (inTok: number, outTok: number) => Math.max(0, Math.round(inTok * USD_PER_M_IN + outTok * USD_PER_M_OUT));

/** The refusal at 100%, with the pack and the free way. */
export const usedUpWords = (nowMs: number, trial = false) =>
  trial
    ? `You've used your trial's AI usage. Add a $${PACK_PRICE_USD} usage pack to keep drafting, or Build it in Claude, free.`
    : `You've used this month's AI usage. Add a $${PACK_PRICE_USD} usage pack to keep drafting, or Build it in Claude, free. It resets on ${dayWords(resetsOn(nowMs))}.`;
export const alertWords = (pct: number, trial = false) => (trial ? `You've used ${pct}% of your trial's AI usage` : `You've used ${pct}% of this month's AI usage`);

const recOf = (s: Pick<State, "aiUsage">, memberId: string): AiUsageRec | null => s.aiUsage?.[memberId] ?? null;

/** The record to change, made or brought to this month. */
function recToChange(s: State, memberId: string, nowMs: number): AiUsageRec {
  const rec = recOf(s, memberId) ?? { month: monthOf(nowMs), usedMicros: 0, packMicros: 0, log: [] };
  if (rec.month !== monthOf(nowMs)) {
    rec.month = monthOf(nowMs);
    rec.usedMicros = 0;
  }
  rec.log ??= [];
  (s.aiUsage ??= {})[memberId] = rec;
  return rec;
}

export interface AiBudget {
  trial: boolean;
  /** The month's (or the trial's) budget, and what of it is used. */
  budget: number;
  used: number;
  pack: number;
  /** A call may start: something of the budget or the pack is left. */
  open: boolean;
}

export function budgetOf(s: Pick<State, "aiUsage" | "billing">, memberId: string, nowMs = Date.now()): AiBudget {
  const rec = recOf(s, memberId);
  const trial = planOf(s.billing?.members[memberId], nowMs) === "trial";
  const budget = trial ? TRIAL_BUDGET_MICROS : MONTH_BUDGET_MICROS;
  const used = trial ? (rec?.trialMicros ?? 0) : rec && rec.month === monthOf(nowMs) ? rec.usedMicros : 0;
  const pack = Math.max(0, rec?.packMicros ?? 0);
  return { trial, budget, used, pack, open: used < budget || pack > 0 };
}

/** The used share of the budget, in whole percent (can pass 100 by the last call). */
export const pctOf = (b: AiBudget) => (b.budget > 0 ? Math.floor((b.used / b.budget) * 100) : 0);

/**
 * Charges a successful call: its cost from the budget first, then the pack. What neither covers
 * stays on the budget's side (one call can take it past 100%). Fires a notice for each threshold
 * newly passed, once a month. Inside a mutate.
 */
export function chargeIn(s: State, memberId: string, nowMs: number, usage: { inTok: number; outTok: number }): AiUsageLog {
  const before = budgetOf(s, memberId, nowMs);
  const rec = recToChange(s, memberId, nowMs);
  const inTok = Math.max(0, Math.round(Number(usage.inTok) || 0));
  const outTok = Math.max(0, Math.round(Number(usage.outTok) || 0));
  const micros = microsOf(inTok, outTok);
  const roomInBudget = Math.max(0, before.budget - before.used);
  const fromPack = Math.min(Math.max(0, micros - roomInBudget), before.pack);
  const onBudget = micros - fromPack;
  if (before.trial) rec.trialMicros = (rec.trialMicros ?? 0) + onBudget;
  else rec.usedMicros += onBudget;
  rec.packMicros = Math.max(0, rec.packMicros - fromPack);
  const entry: AiUsageLog = { at: new Date(nowMs).toISOString(), inTok, outTok, micros };
  rec.log.push(entry);
  if (rec.log.length > LOG_KEEP) rec.log.splice(0, rec.log.length - LOG_KEEP);
  // The notices: each threshold once a month (once for the trial).
  const key = before.trial ? "trial" : monthOf(nowMs);
  if (!rec.alerts || rec.alerts.month !== key) rec.alerts = { month: key, fired: [], seen: [] };
  const pct = pctOf(budgetOf(s, memberId, nowMs));
  for (const a of AI_ALERTS) if (pct >= a && !rec.alerts.fired.includes(a)) rec.alerts.fired.push(a);
  return entry;
}

/** The highest notice fired and not yet seen, for this month (or the trial). */
function noticeOf(rec: AiUsageRec | null, trial: boolean, nowMs: number): AiAlert | null {
  const key = trial ? "trial" : monthOf(nowMs);
  if (!rec?.alerts || rec.alerts.month !== key) return null;
  const open = rec.alerts.fired.filter((a) => !rec.alerts!.seen.includes(a));
  return open.length ? (Math.max(...open) as AiAlert) : null;
}

/** The member closed the notice: every one fired so far is seen. Inside a mutate. */
export function noticeSeenIn(s: State, memberId: string): void {
  const rec = recOf(s, memberId);
  if (!rec?.alerts) return;
  rec.alerts.seen = [...new Set([...rec.alerts.seen, ...rec.alerts.fired])];
}

/** Settings, Plan's meter: a percentage only. Never dollars or tokens. */
export interface AiMeter {
  /** Whole percent of the month's (or the trial's) AI usage used, at most 100. */
  percent: number;
  /** The day it starts again ("YYYY-MM-DD"), or null on a trial. */
  resetsOn: string | null;
  trial: boolean;
  /** Nothing left: the draft button explains, with the pack and Build it in Claude. */
  usedUp: boolean;
  /** Past the month's usage, drafting goes on with a usage pack. */
  onPack: boolean;
  /** "Add an AI usage pack, $10" is offered: on Pro + Close and the trial (canClose). */
  canAddPack: boolean;
  /** A one-time notice to show: "You've used 75% of this month's AI usage". */
  notice: AiAlert | null;
}

export function aiMeter(s: Pick<State, "aiUsage" | "billing">, memberId: string, nowMs = Date.now()): AiMeter {
  const b = budgetOf(s, memberId, nowMs);
  const rec = recOf(s, memberId);
  return {
    percent: Math.min(100, pctOf(b)),
    resetsOn: b.trial ? null : resetsOn(nowMs),
    trial: b.trial,
    usedUp: !b.open,
    onPack: b.used >= b.budget && b.pack > 0,
    canAddPack: canClose(s.billing?.members[memberId], nowMs),
    notice: noticeOf(rec, b.trial, nowMs),
  };
}

/**
 * Adds an AI usage pack: `micros` of Claude usage that never expires. Once per `ref` (the Stripe
 * payment id): the same ref again changes nothing. For the billing webhook. `granted` is false for
 * a ref already granted.
 */
export async function grantAiPack(memberKey: string, micros: number = PACK_MICROS, ref: string, nowMs = Date.now()): Promise<{ granted: boolean }> {
  checkGrant(memberKey, micros, ref);
  // Loaded here, so the rest of this file stays pure (lib/health.ts and lib/table.ts read it).
  const { tableInternals: T } = await import("../table");
  return T.mutate((s) => ({ granted: grantAiPackIn(s, memberKey, micros, ref, nowMs) }));
}

function checkGrant(memberKey: string, micros: number, ref: string): void {
  if (!String(memberKey ?? "").trim() || !String(ref ?? "").trim()) throw new Error("grantAiPack needs the member and the payment reference");
  if (!Number.isInteger(micros) || micros <= 0 || micros > 1_000_000_000) throw new Error("grantAiPack needs a whole number of micro-dollars");
}

/**
 * grantAiPack inside a mutate already running (the billing webhook: lib/billing/aiPack.ts
 * onAiPackPaid). True when it granted; false for a ref already granted.
 */
export function grantAiPackIn(s: State, memberKey: string, micros: number, ref: string, nowMs = Date.now()): boolean {
  checkGrant(memberKey, micros, ref);
  const key = memberKey.trim();
  const r = ref.trim();
  if (recOf(s, key)?.packs?.some((p) => p.ref === r)) return false;
  const rec = recToChange(s, key, nowMs);
  (rec.packs ??= []).push({ ref: r, micros, at: new Date(nowMs).toISOString() });
  rec.packMicros = Math.max(0, rec.packMicros) + micros;
  return true;
}

/** Pilot metrics' Health, admin only: the month's Claude calls in counts and dollars, never whose. */
export interface AiUsageTotals {
  month: string;
  calls: number;
  inTok: number;
  outTok: number;
  /** Estimated Claude cost, micro-dollars. */
  micros: number;
  packsSold: number;
  /** Members past 50%, 90% and 100% of their budget now. */
  past50: number;
  past90: number;
  past100: number;
}

export function aiUsageTotals(s: Pick<State, "aiUsage" | "billing">, nowMs = Date.now()): AiUsageTotals {
  const month = monthOf(nowMs);
  const t: AiUsageTotals = { month, calls: 0, inTok: 0, outTok: 0, micros: 0, packsSold: 0, past50: 0, past90: 0, past100: 0 };
  for (const [id, rec] of Object.entries(s.aiUsage ?? {})) {
    for (const l of rec.log ?? []) {
      if (l.at.slice(0, 7) !== month) continue;
      t.calls += 1;
      t.inTok += l.inTok;
      t.outTok += l.outTok;
      t.micros += l.micros;
    }
    t.packsSold += (rec.packs ?? []).filter((p) => p.at.slice(0, 7) === month).length;
    const pct = pctOf(budgetOf(s, id, nowMs));
    if (pct >= 50) t.past50 += 1;
    if (pct >= 90) t.past90 += 1;
    if (pct >= 100) t.past100 += 1;
  }
  return t;
}

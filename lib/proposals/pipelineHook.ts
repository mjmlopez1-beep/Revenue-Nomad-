/**
 * The proposals' side of the automatic pipeline. A proposal sent moves the company to
 * "proposal_sent", signed to "signed" (Won), declined to "declined" (Lost).
 *
 * lib/table.ts registers proposalToPipeline once, when the server loads it: the pipeline's pure
 * pipelineEvent (lib/pipeline.ts) on the change's own draft state, so the pipeline's move is
 * written in the same commit as the proposal's. Sent moves the member's entry there to Proposal
 * (opening one when there is none), signed to Won (from the signed proposal, with its fee and
 * hours as the Won terms when the member gave none; an intro the entry came through is kept, so
 * it is credited with the win), declined to Lost. A hook that throws never undoes the proposal's
 * own change: it is logged and skipped. Tests swap it with setPipelineHook.
 */
import { randomBytes } from "crypto";
import type { State } from "../table";
import * as P from "../pipeline";
import { docFields, moneyOf } from "./library";
import type { StoredProposal } from "./types";

export type PipelineKind = "proposal_sent" | "signed" | "declined";
/** A document to sign (lib/documents) moves the pipeline the same way: who it went to, and no proposal terms. */
export interface PipelineFrom {
  document: { to: { name: string; title?: string } | null };
}
export type PipelineEventFn = (state: State, memberId: string, companyId: string, kind: PipelineKind, at: string, from?: PipelineFrom) => unknown;

let hook: PipelineEventFn | null = null;

/** Register the pipeline's event function (lib/table.ts at start-up, and tests). Null takes it off. */
export function setPipelineHook(fn: PipelineEventFn | null): void {
  hook = fn;
}

/** The function registered now (tests check the start-up wiring). */
export const pipelineHookNow = (): PipelineEventFn | null => hook;

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const numberIn = (t: string) => (NUMBER_WORDS[t] ?? Number(t));

/**
 * Hours a week from the proposal's allocation as the member wrote it: "15 hours a week", "60 hours
 * a month", "two days a week" (8 hours a day). Null when it says none of these.
 */
export function hoursAWeek(raw: string | undefined | null): number | null {
  const t = String(raw ?? "").toLowerCase();
  const n = "(\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven)";
  const per = "\\s*(?:a|an|per|\\/|each)\\s*";
  let h: number | null = null;
  let m = t.match(new RegExp(`${n}\\s*(?:hours?|hrs?)${per}(week|wk|month|mo)`));
  if (m) h = numberIn(m[1]) * (m[2].startsWith("w") ? 1 : 12 / 52);
  else if ((m = t.match(new RegExp(`${n}\\s*days?${per}(?:week|wk)`)))) h = numberIn(m[1]) * 8;
  if (h === null || !Number.isFinite(h) || h <= 0 || h > 80) return null;
  return Math.round(h * 10) / 10;
}

/**
 * A signed proposal's terms for the Won entry: its monthly fee, the hours a week its allocation
 * gives, and its initial term in months. Null without a monthly fee.
 */
export function wonTermsOf(p: Pick<StoredProposal, "fields" | "version" | "signer">): Omit<P.WonTerms, "at" | "merlin"> | null {
  const f = docFields(p);
  const fee = moneyOf(f["pricing.monthlyFee"]);
  if (fee === null || fee > 500_000) return null;
  const months = Number(f["term.initialMonths"]);
  return { pricing: "monthly", rate: fee, hours: hoursAWeek(f["pricing.allocation"]), start: null, months: Number.isInteger(months) && months > 0 && months <= 60 ? months : null };
}

/** The member's proposal at this company the event is about: the one signed (or sent, declined) at `at`, else the latest. */
function proposalAt(state: State, memberId: string, companyId: string, kind: PipelineKind, at: string): StoredProposal | null {
  const mine = (state.proposals ?? []).filter((p) => p.memberId === memberId && p.companyId === companyId);
  const when = (p: StoredProposal) =>
    // A countersigned proposal's Won is at the member's countersignature.
    p.sends.some((x) => (kind === "signed" ? x.signed?.at === at || x.member?.at === at : (kind === "declined" ? x.declined?.at : x.sentAt) === at));
  return mine.find(when) ?? [...mine].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
}

/**
 * The hook lib/table.ts registers: the pipeline's own pipelineEvent on the change's draft state,
 * then, on a signature, the proposal's terms as the Won terms (only when the member gave none).
 */
export function proposalToPipeline(state: State, memberId: string, companyId: string, kind: PipelineKind, at: string, from?: PipelineFrom): P.PipelineEntry {
  const atMs = Date.parse(at);
  const nowMs = Number.isFinite(atMs) ? Math.max(atMs, 0) : Date.now();
  const e = P.pipelineEvent(state, memberId, companyId, kind, at, () => `pl${randomBytes(8).toString("hex")}`, nowMs);
  // A document: who it went to, as the member typed them. Its terms are in the PDF, not in fields Merlin can read.
  if (from?.document) {
    const to = from.document.to;
    if (to && !e.to.name && !e.to.memberId) e.to = { ...e.to, name: to.name, ...(to.title ? { role: to.title } : {}) };
    return e;
  }
  const p = proposalAt(state, memberId, companyId, kind, at);
  // Opened by the proposal: who it went to, as the member typed it on the proposal.
  if (p?.signer && !e.to.name && !e.to.memberId) e.to = { ...e.to, name: p.signer.name, ...(p.signer.title ? { role: p.signer.title } : {}) };
  if (kind === "signed" && p && !e.won) {
    const terms = wonTermsOf(p);
    if (terms) P.setWonTerms(e, { ...terms, merlin: P.merlinByDefault(e) }, nowMs);
  }
  return e;
}

/** Tell the pipeline, when there is one. `companyId` is the internal company id; a company typed in, not on Merlin, has none and is skipped. */
export function pipelineEvent(state: State, memberId: string, companyId: string | null, kind: PipelineKind, at: string, from?: PipelineFrom): void {
  if (!hook || !companyId) return;
  try {
    if (from) hook(state, memberId, companyId, kind, at, from);
    else hook(state, memberId, companyId, kind, at);
  } catch (e) {
    console.error("pipeline event failed", kind, e);
  }
}

/**
 * The proposals' side of the automatic pipeline. A proposal sent moves the company to
 * "proposal_sent", signed to "signed" (Won), declined to "declined" (Lost).
 *
 * The pipeline (lib/pipeline.ts, pipelineEvent) isn't merged yet, so this adapter calls it when it
 * is there and does nothing otherwise. To wire it at merge, register it once:
 *
 *   import { pipelineEvent } from "../pipeline";
 *   setPipelineHook(pipelineEvent);
 *
 * (or replace `hook` below with a direct call). It is called inside the same state change that
 * sends, signs or declines (lib/proposals/store.ts), with that change's draft state, so the
 * pipeline's move is written in the same commit. A hook that throws never undoes the proposal's
 * own change: it is logged and skipped.
 */
import type { State } from "../table";

export type PipelineKind = "proposal_sent" | "signed" | "declined";
export type PipelineEventFn = (state: State, memberId: string, companyId: string, kind: PipelineKind, at: string) => unknown;

let hook: PipelineEventFn | null = null;

/** Register the pipeline's event function (at merge, and in tests). Null takes it off. */
export function setPipelineHook(fn: PipelineEventFn | null): void {
  hook = fn;
}

/** Tell the pipeline, when there is one. `companyId` is the internal company id; a company typed in, not on Merlin, has none and is skipped. */
export function pipelineEvent(state: State, memberId: string, companyId: string | null, kind: PipelineKind, at: string): void {
  if (!hook || !companyId) return;
  try {
    hook(state, memberId, companyId, kind, at);
  } catch (e) {
    console.error("pipeline event failed", kind, e);
  }
}

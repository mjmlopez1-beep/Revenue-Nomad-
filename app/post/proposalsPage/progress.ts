/**
 * The one-screen Proposals' progress line (RN_PROPOSALS2): "Ready in 4.2 s. 2 things to fill", each
 * blank a chip that jumps to the section it is in. Pure, for the app and the checks.
 */
import { blanksOf, docFields, placeholders } from "@/lib/proposals/library";
import type { ProposalRec } from "@/lib/proposals/types";

/** The blanks left, each once, with the section it is in (its block id). */
export function blanksWithPlaceOf(p: Pick<ProposalRec, "blocks" | "fields" | "version" | "signer">): { key: string; block: string }[] {
  return blanksOf(p.blocks, docFields(p)).map((k) => ({ key: k, block: p.blocks.find((b) => placeholders(b.body).includes(k))?.id ?? "" }));
}

/** "Ready in 4.2 s." from milliseconds. */
export const readyWords = (ms: number) => `Ready in ${(Math.max(0, ms) / 1000).toFixed(1)} s.`;
/** "2 things to fill", "1 thing to fill", or the all-clear. */
export const fillWords = (n: number) => (n ? `${n} ${n === 1 ? "thing" : "things"} to fill:` : "Nothing left blank. Read it through, then send it.");

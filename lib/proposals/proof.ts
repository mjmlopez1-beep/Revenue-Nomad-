/**
 * Proof from Evidence Bank (a Close feature): what the editor's Proof shows for one proposal, and
 * the cases it may hold. The text that fills {{caseStudies}} is set in store.ts (createProposal,
 * linkProposal and the `proofCases` change), from lib/evidenceWire.ts, so the client's copy only ever
 * carries the client's label unless the member named them. Merlin never writes a case.
 */
import { loadSeed, loadState, memberByToken } from "../table";
import { casesIn, proofIn } from "../evidence";
import { PROOF_MAX, closeOn, rankedLines } from "../evidenceWire";
import type { ProofView, StoredProposal } from "./types";

/** Proof's block is in the proposal (the library's "proof"). */
export const hasProofBlock = (p: Pick<StoredProposal, "blocks">) => p.blocks.some((b) => b.blockId === "proof");

/**
 * The editor's Proof for one of the member's proposals: every ready case, closest to its company
 * first (unmatched without a company), the ones it holds, Merlin's own pick (lib/evidence proofIn,
 * the same one or two a new proposal takes) and the drafts. Off Close: { on: false } and nothing
 * else. Null when it isn't theirs (or they're signed out).
 */
export async function proofView(token: string | null, id: string, nowMs = Date.now()): Promise<ProofView | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) return null;
  const p = (s.proposals ?? []).find((x) => x.id === id && x.memberId === me.id);
  if (!p) return null;
  if (!closeOn(s, me.id, nowMs)) return { on: false, cases: [], chosen: [], drafts: [], picked: [] };
  const lines = rankedLines(seed, s, me.id, p.companyId);
  const ready = new Set(lines.map((l) => l.id));
  return {
    on: true,
    cases: lines.map(({ line, ...l }) => ({ ...l, text: line })),
    chosen: (p.proofCases ?? []).filter((x) => ready.has(x)),
    drafts: casesIn(s, me.id)
      .filter((c) => c.status === "draft")
      .map((c) => ({ title: String(c.title || c.client.label || "A draft case").slice(0, 120) })),
    picked: p.companyId ? proofIn(seed, s, me.id, p.companyId, PROOF_MAX, nowMs).filter((i) => i.match && i.match.label !== "Different").map((i) => i.caseId) : [],
  };
}

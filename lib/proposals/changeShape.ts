/**
 * A change Merlin proposes to a proposal (lib/proposals/change.ts), and the proposal with it laid
 * over, as the app shows it before the member accepts. Pure: the app and the server share it.
 */
import type { NumberCheck } from "./numbers";
import type { ProposalBlock } from "./types";

/** One section's proposed text. `id` is the section's id in the proposal, or "new" for a section to add. */
export interface SectionChange {
  id: string;
  title: string;
  body: string;
  /** One line on what changed, after the section's name ("is now two phases: ..."). */
  summary: string;
}
export interface ChangeProposal {
  instruction: string;
  changes: SectionChange[];
  /** {{key}} values to set ("" clears one). */
  fields: Record<string, string>;
  check: NumberCheck;
  /** The instruction couldn't be followed as asked: what to say instead. */
  unclear: string | null;
}

/** The proposal with a change laid over it: its blocks and fields as they would read. */
export function withChange(p: { blocks: ProposalBlock[]; fields: Record<string, string> }, changes: SectionChange[], fields: Record<string, string>): { blocks: ProposalBlock[]; fields: Record<string, string> } {
  const blocks = p.blocks.map((b) => {
    const c = changes.find((x) => x.id === b.id);
    return c ? { ...b, title: c.title || b.title, body: c.body } : b;
  });
  changes.filter((x) => x.id === "new").forEach((c, i) => blocks.push({ id: `nw${i}`, blockId: "custom", title: c.title || "Section", body: c.body }));
  const f = { ...p.fields };
  for (const [k, v] of Object.entries(fields)) if (v.trim()) f[k] = v.trim();
  else delete f[k];
  return { blocks, fields: f };
}


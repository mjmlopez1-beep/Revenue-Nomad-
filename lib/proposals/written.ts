/**
 * Sections Merlin wrote from a call brief (quick.ts writeSections), and how they go into a document
 * the member may be editing meanwhile: an existing section only where it still reads as it did when
 * the pass began, a new one (the Senior operator family's sections) in the template's order. Pure,
 * for the app and the server alike.
 */
import type { ProposalBlock } from "./types";

/** One section the pass wrote: an existing block's new text, or a new block after `add.after` (a block id, or null for the start). */
export interface WrittenSection {
  id: string;
  blockId: string;
  title: string;
  body: string;
  add?: { after: string | null };
}

/** Put written sections into a document's blocks: existing ones where untouched, new ones in place. */
export function mergeWritten(blocks: ProposalBlock[], sections: WrittenSection[], before: Record<string, string>): { blocks: ProposalBlock[]; n: number } {
  let out = blocks.map((b) => ({ ...b }));
  let n = 0;
  for (const x of sections) {
    const b = out.find((y) => y.id === x.id);
    if (b) {
      if (b.body === before[x.id] && b.body !== x.body) (b.body = x.body), (b.title = x.title || b.title), n++;
    } else if (x.add) {
      const at = x.add.after ? out.findIndex((y) => y.id === x.add!.after) : -1;
      out = [...out.slice(0, at + 1), { id: x.id, blockId: x.blockId, title: x.title, body: x.body }, ...out.slice(at + 1)];
      n++;
    }
  }
  return { blocks: out, n };
}

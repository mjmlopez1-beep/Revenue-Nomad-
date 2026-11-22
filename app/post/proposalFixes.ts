/**
 * What to fix before a proposal goes out, in one list: the draft's "Draft ready" screen and the
 * editor count the same things the same way (the patterns that win, musts first, the risk flags,
 * what the draft said to check, then the soft ones).
 */
import { checklist, docFields, riskFlags } from "@/lib/proposals/library";
import { adviceFromView } from "@/lib/proposals/rates";
import type { ProposalRec } from "@/lib/proposals/types";
import type { View } from "@/lib/tableTypes";

export function fixesFor(p: ProposalRec, view: View, toFix: string[] = []): string[] {
  const fields = docFields(p);
  const checks = checklist({ ...p, fields });
  const advice = adviceFromView(view, p);
  const flags = riskFlags(p, advice.suggestion?.high ?? null);
  const checkNotes = p.notes.filter((n) => n.key === "check").map((n) => n.text);
  return [...checks.filter((c) => !c.ok && !c.soft).map((c) => c.missing!), ...flags.map((f) => f.message), ...checkNotes, ...toFix.filter((t) => !checkNotes.includes(t)), ...checks.filter((c) => !c.ok && c.soft).map((c) => c.missing!)];
}

"use client";

/**
 * The status line at the foot of the table: rows in view, the credits the last run spent, and on
 * the trial and Pro how many of today's free company opens are used.
 */
import type { Me } from "@/lib/tableTypes";

export function StatusLine({ me, run }: { me: Pick<Me, "proOpens" | "plan">; run: { label: string; filled: number; of: number; spent: number } | null }) {
  if (run)
    return (
      <span className="wb-status" aria-live="polite">
        {run.label} · {run.filled} of {run.of} filled · {run.spent === 1 ? "1 credit" : `${run.spent} credits`} spent
      </span>
    );
  if (me.proOpens) {
    const used = me.proOpens.of - me.proOpens.left;
    return (
      <span className="wb-status" aria-live="polite">
        Trial: {me.proOpens.left} of {me.proOpens.of} companies left today. Each opens free, with everything on it{used >= me.proOpens.of ? ". More open tomorrow" : ""}.
      </span>
    );
  }
  return <span className="wb-status">Table up to date</span>;
}

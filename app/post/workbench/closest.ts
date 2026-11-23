/**
 * Evidence Bank's closest case per company, as this browser last had it (GET /api/evidence/closest,
 * lib/evidenceWire.ts closestView), for the Closest evidence column (columns.ts, cells.tsx), the
 * Company page's card and Hiring now. Pure: no React, so scripts/test-workbench.mts reads it as the
 * table does. useClosest.ts fills it. Evidence Bank is Close only: off Close nothing is fetched and
 * every row reads as not matched.
 */
import type { ClosestRow } from "@/lib/evidenceWire";

export type { ClosestRow };

/** A company asked about: its closest case, or null when none of the member's ready cases is matched to it. */
const rows = new Map<string, { row: ClosestRow | null; at: number }>();
/** How long a row is kept before it is asked again (a case saved meanwhile changes it). */
export const CLOSEST_TTL = 120_000;

export const closestOf = (companyId: string): ClosestRow | null => rows.get(companyId)?.row ?? null;
/** Asked about already, and not stale. */
export const closestKnown = (companyId: string, nowMs = Date.now()) => {
  const x = rows.get(companyId);
  return !!x && nowMs - x.at < CLOSEST_TTL;
};
/** What the server said for these companies (ids without a row: none matched). */
export function putClosest(ids: readonly string[], got: Record<string, ClosestRow>, nowMs = Date.now()): void {
  for (const id of ids) rows.set(id, { row: got[id] ?? null, at: nowMs });
}
/** Forget every row (a case was saved, or the member's plan changed). */
export const clearClosest = () => rows.clear();

/** The match word as a page says it: "Close match", so it never reads as the Close plan's name. */
export const labelWords = (label: ClosestRow["label"]) => (label === "Close" ? "Close match" : label);
/** The match word, the case's title and why, as the column says them. */
export const closestWords = (r: ClosestRow | null) => (r ? { label: labelWords(r.label), title: r.title ?? "", why: r.same.slice(0, 2).join(" · ") || (r.diff[0] ?? "") } : null);

/**
 * How a bulk unlock is split for the server: one unlockMany takes UNLOCK_BATCH facts at most
 * (lib/table.ts reads the first 60 of its items), so a longer run goes in batches of that size.
 * Pure, shared by the quote (lib/unlockQuote.ts) and the run in the browser (app/post/workbench/run.ts).
 */

/** The most facts one unlockMany takes. */
export const UNLOCK_BATCH = 60;
/** The most facts one quote and one run take: ten batches. */
export const UNLOCK_QUOTE_MAX = 600;

/** The run's items in the batches they go to the server in, in order. */
export function batchesOf<T>(items: readonly T[], size = UNLOCK_BATCH): T[][] {
  const out: T[][] = [];
  for (let k = 0; k < items.length; k += size) out.push(items.slice(k, k + size));
  return out;
}

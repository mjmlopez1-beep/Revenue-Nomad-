/**
 * The quote before a bulk unlock (the workbench's "Unlock N", and a Tools run such as Decision
 * maker on every row): what the run would spend, worked out by the unlock itself as a dry run
 * (lib/table.ts perform with dryRun, the connector's "what would this cost"), so the quote is the
 * server's own number and never a guess in the browser.
 *
 * One unlockMany takes UNLOCK_BATCH facts at most (lib/table.ts reads the first 60), so a run goes
 * to the server in batches of that size, and each batch is quoted the same way. When a limit stops
 * part of the run (the day's unlock limit, the balance, a fact that must open after another), the
 * quote says how many facts fit from the start of the list, what that part costs, and gives the
 * server's own words for the limit (`stop`), so the member sees it before they say yes.
 *
 * Each batch is quoted on the state as it is now. A later batch can cost more once the earlier ones
 * ran (the trial's free opens used up on the way): the browser quotes each batch again right before
 * it runs and stops when it would spend more than it was quoted (app/post/workbench/run.ts), so a
 * run never spends more than the member agreed to.
 */
import { ActionError, balance, loadState, memberForToken, perform, type Action } from "./table";
import type { Entity } from "./tableFields";
import type { UnlockQuote } from "./tableTypes";
import { UNLOCK_BATCH, UNLOCK_QUOTE_MAX, batchesOf } from "./unlockBatch";

export { UNLOCK_BATCH, UNLOCK_QUOTE_MAX, batchesOf };

export type QuoteItem = { entity: Entity; id: string; field: string };

/** Plain objects with a known entity and string id and field: what a broken or hostile client sends is left out, as unlockMany does. */
export function cleanItems(raw: unknown): QuoteItem[] {
  if (!Array.isArray(raw)) return [];
  const out: QuoteItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object" || Array.isArray(it)) continue;
    const x = it as Record<string, unknown>;
    if ((x.entity === "company" || x.entity === "engagement" || x.entity === "contact") && typeof x.id === "string" && typeof x.field === "string") out.push({ entity: x.entity, id: x.id, field: x.field });
    if (out.length >= UNLOCK_QUOTE_MAX) break;
  }
  return out;
}

type Dry = { ok: true; cost: number } | { ok: false; stop: string };

/** One batch as a dry run: what it would spend, or the server's words for why it can't run. */
async function dry(token: string | null, items: QuoteItem[], opts: { asMember?: boolean; from?: "crystal" }): Promise<Dry> {
  if (!items.length) return { ok: true, cost: 0 };
  const action: Action = { type: "unlockMany", items, ...(opts.from ? { from: opts.from } : {}) };
  try {
    const r = await perform(token, action, undefined, { dryRun: true, asMember: !!opts.asMember });
    return { ok: true, cost: Math.max(0, r.spent ?? 0) };
  } catch (e) {
    if (e instanceof ActionError) return { ok: false, stop: e.message };
    throw e;
  }
}

/**
 * The quote for a run. Signed out: null. Writes nothing (each dry run's change is dropped).
 * A batch that can't run whole is narrowed to the longest start of it that can (a few dry runs,
 * halving), so `fits` and `cost` describe exactly what Run would do.
 */
export async function quoteUnlock(token: string | null, raw: unknown, opts: { asMember?: boolean; from?: "crystal" } = {}): Promise<UnlockQuote | null> {
  const member = await memberForToken(token);
  if (!member) return null;
  const items = cleanItems(raw);
  const credits = Math.max(0, balance(await loadState(), member.id));
  const batches: { n: number; cost: number }[] = [];
  let fits = 0;
  let cost = 0;
  let stop: string | null = null;
  for (const b of batchesOf(items)) {
    const whole = await dry(token, b, opts);
    if (whole.ok) {
      batches.push({ n: b.length, cost: whole.cost });
      fits += b.length;
      cost += whole.cost;
      continue;
    }
    // The longest start of this batch that runs: lo runs (or is 0), hi doesn't.
    let lo = 0;
    let loCost = 0;
    let hi = b.length;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      const r = await dry(token, b.slice(0, mid), opts);
      if (r.ok) (lo = mid), (loCost = r.cost);
      else hi = mid;
    }
    if (lo > 0) batches.push({ n: lo, cost: loCost });
    fits += lo;
    cost += loCost;
    stop = whole.stop;
    break;
  }
  return { asked: items.length, batches, fits, cost, stop, credits, after: Math.max(0, credits - cost) };
}

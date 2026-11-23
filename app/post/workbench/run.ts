/**
 * A bulk run in the browser: one quote, one confirm, one button. Credits are never spent by a
 * stray click: picking rows or a tool only asks the server for a quote (POST unlockMany with
 * `quote: true`, a dry run), and the run itself starts only from the confirm's own button, with the
 * quote it showed.
 *
 * The run goes in batches of UNLOCK_BATCH. Right before each batch it is quoted again on the state
 * as it now is, and the run stops (spending nothing more) when that batch would cost more than the
 * member was quoted for it, or no longer fits whole (a limit reached on the way, the trial's free
 * opens used up). So a run never spends more than the quote the member said yes to. Pure apart from
 * the two functions it is handed, so scripts/test-workbench.mts runs it against the real server code.
 */
import type { UnlockQuote } from "@/lib/tableTypes";
import { batchesOf } from "@/lib/unlockBatch";
import type { FactRef } from "../model";

export interface RunDeps {
  /** The server's quote for these items (nothing spent), or why there is none. */
  quote: (items: FactRef[]) => Promise<UnlockQuote | { error: string }>;
  /** Run one batch, already agreed to, at this cost. True when it went through. */
  unlock: (items: FactRef[], cost: number) => Promise<boolean>;
}

export interface RunOutcome {
  /** Facts that ran, and the credits the quotes said they cost. */
  done: number;
  spent: number;
  /** Why the run stopped early, in words for the member. Null when all of the quote's part ran. */
  stopped: string | null;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * Run what the quote covers (its first `fits` items), only with `confirmed` from the confirm's
 * button. Without it nothing is asked of the server at all.
 */
export async function runUnlock(o: { items: FactRef[]; quote: UnlockQuote; confirmed: boolean }, deps: RunDeps, onBatch?: (done: number, of: number) => void): Promise<RunOutcome> {
  if (o.confirmed !== true) return { done: 0, spent: 0, stopped: "Nothing ran: the run needs your yes first." };
  const items = o.items.slice(0, o.quote.fits);
  const batches = batchesOf(items);
  let done = 0;
  let spent = 0;
  for (let k = 0; k < batches.length; k++) {
    const b = batches[k];
    const planned = o.quote.batches[k]?.cost ?? 0;
    const fresh = await deps.quote(b);
    if ("error" in fresh) return { done, spent, stopped: fresh.error };
    if (fresh.fits < b.length || fresh.cost > planned) {
      const left = items.length - done;
      const why = fresh.stop ?? (fresh.cost > planned ? `The next ${plural(b.length, "row")} would now cost ${plural(fresh.cost, "credit")}, not ${plural(planned, "credit")}.` : null);
      return { done, spent, stopped: `Stopped with ${plural(left, "row")} to go, so nothing more was spent. ${why ?? ""} Quote it again to see the new total.`.replace(/\s+/g, " ").trim() };
    }
    const ok = await deps.unlock(b, fresh.cost);
    if (!ok) return { done, spent, stopped: done ? `Stopped after ${plural(done, "row")}.` : "That didn't go through, so nothing was spent." };
    done += b.length;
    spent += fresh.cost;
    onBatch?.(done, items.length);
  }
  return { done, spent, stopped: null };
}

"use client";

/**
 * The browser's side of a bulk run: ask the server what it would spend (a quote, nothing spent),
 * and the RunDeps that runUnlock uses, with the app's own unlockMany for each agreed batch (its
 * toast, Undo and the cells' flash, as any unlock).
 */
import type { UnlockQuote } from "@/lib/tableTypes";
import { post } from "../../ui/shared";
import type { FactRef } from "../model";
import type { Ui } from "../ui";
import type { RunDeps } from "./run";

const wire = (items: FactRef[]) => items.map(({ entity, id, field }) => ({ entity, id, field }));

/** The server's quote for these facts. Nothing is spent. */
export async function fetchQuote(items: FactRef[]): Promise<UnlockQuote | { error: string }> {
  const r = await post<{ quote?: UnlockQuote }>({ action: { type: "unlockMany", items: wire(items), quote: true } });
  if (r.error) return { error: r.error };
  return r.quote ?? { error: "That didn't go through. Try again." };
}

/** Each agreed batch through the app's unlock (already confirmed: the run's own button was the yes). */
export const appDeps = (ui: Pick<Ui, "unlockMany">): RunDeps => ({
  quote: fetchQuote,
  unlock: (items, cost) => ui.unlockMany(items, { confirmed: true, cost }),
});

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** "6 credits", or "free" when it costs nothing. */
export const creditWords = (n: number) => (n ? plural(n, "credit") : "free");

/** The quote in words: "6 credits for 5. You have 25, 19 after." and the stop, if any. */
export function quoteWords(q: UnlockQuote, noun: [string, string], freeOpensLeft?: number | null): { total: string; after: string; stop: string | null } {
  const what = q.fits === 1 ? noun[0] : noun[1];
  const total = q.fits === 0 ? `None of these can open now` : q.cost ? `${plural(q.fits, what, what)} · ${plural(q.cost, "credit")}` : `${plural(q.fits, what, what)} · free`;
  const opens = noun[0] === "company" && freeOpensLeft != null && freeOpensLeft > 0 && q.fits > 0 ? ` Uses ${Math.min(q.fits, freeOpensLeft)} of today's ${freeOpensLeft} free opens left.` : "";
  const after = q.cost ? `You have ${plural(q.credits, "credit")}. ${plural(q.after, "credit")} after.${opens}` : `No credits spent.${opens}`;
  const stop = q.stop ? (q.fits < q.asked ? `Only the first ${plural(q.fits, what, what)} fit. ${q.stop}` : q.stop) : null;
  return { total, after, stop };
}

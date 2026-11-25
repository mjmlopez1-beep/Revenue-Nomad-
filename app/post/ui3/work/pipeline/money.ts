/**
 * Pipeline's money summary (the new design, RN_UI3), from the member's own deals only: the values
 * they typed a month, or a Won deal's terms. Proposals out is a part of the open pipeline, never
 * added to it. No probabilities, no guesses: a deal with no value counts as none.
 * Pure: the page and scripts/test-ui3-work.mts read it.
 */
import type { PipelineRec } from "@/lib/pipeline";

type Deal = Pick<PipelineRec, "stage" | "won" | "monthly">;
/** The open stages, To reach out to Proposal. */
export const OPEN_STAGES = ["reach", "sent", "replied", "meeting", "proposal"] as const;
/** What a deal counts a month: a Won deal's terms (none until they are added), else the value typed. */
const monthly = (r: Deal) => (r.stage === "won" && !r.won ? 0 : r.monthly);

export function moneyOf(deals: readonly Deal[]) {
  const open = deals.filter((r) => (OPEN_STAGES as readonly string[]).includes(r.stage));
  const props = open.filter((r) => r.stage === "proposal");
  const won = deals.filter((r) => r.stage === "won");
  const sum = (xs: readonly Deal[]) => xs.reduce((s, r) => s + monthly(r), 0);
  return { open: sum(open), openN: open.length, openNoValue: open.filter((r) => !monthly(r)).length, props: sum(props), propsN: props.length, won: sum(won), wonN: won.length };
}

/** "$96.5k": one decimal under a hundred thousand, none above; dollars under a thousand. */
export const kMoney = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(n >= 100_000 || n % 1000 === 0 ? 0 : 1)}k` : `$${Math.round(n).toLocaleString("en-US")}`);
